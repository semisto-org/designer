// The buildings around a map as clean volumes (footprint × height), instead
// of roofs melted into the terrain mesh by the surface model. Footprints come
// from OpenStreetMap (GET /maps/:id/relief/buildings); the height is
// measured on the surface model when the region has one (median of what
// stands above the ground inside the footprint), else read from the tags
// (`height`, `building:levels`), else guessed from the kind of building.
// No import of three.js: the scene turns the volumes into a mesh.

import { toGrid, type GridMeta } from './grid.ts'
import { fitRoof, roofHeight, shell, type RoofSample, type RoofShape, type Shell } from './roofs.ts'

/** One building as the server sends it: WGS84 rings, tagged heights. */
export type BuildingData = {
  id: string
  kind: string
  rings: Array<Array<[number, number]>>
  height: number | null
  minHeight: number | null
  levels: number | null
}

export type BuildingsResponse = { available: boolean; attribution: string | null; buildings: BuildingData[] }

export type HeightSource = 'surface' | 'tags' | 'guess'

/** A building ready for the scene, in grid metres (x east, y south of the first cell). */
export type BuildingVolume = {
  id: string
  rings: Array<Array<{ x: number; y: number }>>
  /** Altitude of the ground at its foot (the lowest point under it). */
  base: number
  /** Height of the highest point of the roof above the base, in real metres. */
  height: number
  /** The roof's shape (flat without a surface model). */
  roof: RoofShape
  /** Per footprint ring: its walls with the roof's height at each corner, and the roof's planar faces. */
  shells: Shell[]
  /** Height of the bottom above the base (a roof on posts), in real metres. */
  bottom: number
  source: HeightSource
}

export type BuildingLayer = {
  volumes: BuildingVolume[]
  /** 1 on the cells under a building and the cell around them. */
  covered: Uint8Array
  /** The relief with the volumes on it, for the shadows when there is no surface model. */
  roofs: Float32Array
}

const STOREY = 3
const ROOF = 1.5
const MIN_HEIGHT = 2.2
const MAX_HEIGHT = 150
const LOW_KINDS = new Set(['shed', 'garage', 'garages', 'carport', 'hut', 'cabin', 'greenhouse', 'roof', 'kiosk', 'container', 'shelter', 'toilets'])
const TALL_KINDS = new Set(['church', 'cathedral', 'chapel', 'industrial', 'warehouse', 'hangar', 'barn', 'farm_auxiliary', 'riding_hall', 'sports_hall'])

/** A height from the tags or the kind of building, in metres. */
export function taggedHeight(building: BuildingData): { height: number; source: HeightSource } {
  if (building.height) return { height: building.height, source: 'tags' }
  if (building.levels) return { height: building.levels * STOREY + ROOF, source: 'tags' }
  if (LOW_KINDS.has(building.kind)) return { height: 3, source: 'guess' }
  if (TALL_KINDS.has(building.kind)) return { height: 9, source: 'guess' }
  return { height: 7, source: 'guess' }
}

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  const mid = values.length >> 1
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
}

/** Cell indices whose centre lies inside the rings (even-odd scanlines over the rings' box only). */
export function cellsInside(meta: GridMeta, rings: Array<Array<{ x: number; y: number }>>): number[] {
  const cell = meta.cellSizeM
  let minY = Infinity
  let maxY = -Infinity
  for (const ring of rings) for (const p of ring) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y }
  const firstRow = Math.max(0, Math.ceil(minY / cell))
  const lastRow = Math.min(meta.rows - 1, Math.floor(maxY / cell))
  const cells: number[] = []
  for (let r = firstRow; r <= lastRow; r++) {
    const y = r * cell
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
      const first = Math.max(0, Math.ceil(xs[k] / cell))
      const last = Math.min(meta.cols - 1, Math.floor(xs[k + 1] / cell))
      for (let c = first; c <= last; c++) cells.push(r * meta.cols + c)
    }
  }
  return cells
}

/**
 * The surface model inside a footprint, as heights above the building's
 * base. The cells along the walls are dropped (the model blurs a wall over
 * a cell), unless that leaves too few.
 */
function roofSamples(
  meta: GridMeta, cells: number[], base: number,
  { original, ground, surface }: { original: Float32Array; ground: Float32Array; surface: Float32Array },
): RoofSample[] {
  const set = new Set(cells)
  const { cols, cellSizeM } = meta
  const inner = cells.filter((i) => set.has(i - 1) && set.has(i + 1) && set.has(i - cols) && set.has(i + cols))
  const kept = inner.length >= 12 ? inner : cells
  return kept.map((i) => ({
    x: (i % cols) * cellSizeM,
    y: Math.floor(i / cols) * cellSizeM,
    z: surface[i] - original[i] + ground[i] - base,
  }))
}

function nearestCell(meta: GridMeta, p: { x: number; y: number }): number | null {
  const c = Math.round(p.x / meta.cellSizeM)
  const r = Math.round(p.y / meta.cellSizeM)
  if (c < 0 || r < 0 || c >= meta.cols || r >= meta.rows) return null
  return r * meta.cols + c
}

/**
 * The volumes of the buildings standing on the grid, with their measured or
 * tagged heights. `original` is the imported relief (what the surface model
 * is measured against), `ground` the relief shown (dug ponds and swales).
 */
export function buildingLayer(
  meta: GridMeta,
  buildings: BuildingData[],
  { original, ground, surface }: { original: Float32Array; ground: Float32Array; surface: Float32Array | null },
): BuildingLayer {
  const { cols, rows } = meta
  const inside = new Uint8Array(cols * rows)
  const roofs = Float32Array.from(ground)
  const volumes: BuildingVolume[] = []
  for (const building of buildings) {
    const rings = building.rings.map((ring) => ring.map((p) => toGrid(meta, p)))
    const cells = cellsInside(meta, rings)
    const vertexCells = rings[0].map((p) => nearestCell(meta, p)).filter((i): i is number => i !== null)
    if (!cells.length && !vertexCells.length) continue

    let base = Infinity
    for (const i of cells) if (ground[i] < base) base = ground[i]
    for (const i of vertexCells) if (ground[i] < base) base = ground[i]

    let { height, source } = taggedHeight(building)
    let roof: RoofShape = { type: 'flat', height }
    if (surface && cells.length >= 4) {
      const measured = median(cells.map((i) => surface[i] - original[i]))
      // Lower than a garden shed: the model predates the building, or the
      // footprint misses it. Keep the tags.
      if (measured >= MIN_HEIGHT) {
        source = 'surface'
        roof = fitRoof(rings[0], roofSamples(meta, cells, base, { original, ground, surface }), measured)
      }
    }
    if (roof.type === 'flat') roof = { type: 'flat', height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, roof.height)) }
    const shells = rings.map((ring) => shell(ring, roof, MIN_HEIGHT, MAX_HEIGHT))
    height = Math.max(...shells.flatMap((s) => s.ring.map((p) => p.top)))
    const bottom = building.minHeight && building.minHeight < height ? building.minHeight : 0
    volumes.push({ id: building.id, rings, base, height, roof, shells, bottom, source })
    for (const i of cells) {
      inside[i] = 1
      if (bottom) continue
      const p = { x: (i % cols) * meta.cellSizeM, y: Math.floor(i / cols) * meta.cellSizeM }
      const top = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, roofHeight(roof, p)))
      roofs[i] = Math.max(roofs[i], base + top)
    }
  }

  // One cell around the footprints: the surface model's walls are blurred
  // over a cell or two, and would show as a skirt around the volume.
  const covered = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (!inside[i]) continue
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) covered[rr * cols + cc] = 1
        }
      }
    }
  }
  return { volumes, covered, roofs }
}
