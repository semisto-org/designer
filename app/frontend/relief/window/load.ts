// The relief and the plants « Fenêtre sur l'an 15 » needs, from the grids
// the 3D view already downloads: the ground (to stand on and to hide what
// is behind a bank), the surface model when there is one (buildings and
// woods hide trees too) and the design's plants on the grid.

import { decodeGrid, downsample } from '../hydro.ts'
import { scenePlants, type GrowingPlantsData, type ScenePlant } from '../growth.ts'
import type { GridMeta } from '../grid.ts'
import type { TerrainGridData } from '@/types/relief'
import type { WindowFrame, WindowGround } from './windowScene.ts'

export type WindowData = {
  meta: GridMeta
  frame: WindowFrame
  /** What hides the plants: the surface model, else the ground. */
  occluder: WindowGround
  /** The ground's altitude (m) at a point of the grid (metres, x east, z south), held to the grid's edge. */
  ground: (x: number, z: number) => number
  /** Width and depth of the grid, in metres. */
  size: { width: number; depth: number }
  plants: ScenePlant[]
  altitudes: Float32Array
}

/** A phone draws ~250 000 vertices with ease; the occluder needs no more. */
const OCCLUDER_BUDGET = 250_000

export async function loadWindow(terrain: TerrainGridData, growing: GrowingPlantsData | null): Promise<WindowData> {
  const fetchBinary = (url: string | null) => url
    ? fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : Promise.resolve(null)
  const [grid, surfaceBuffer] = await Promise.all([fetchBinary(terrain.files.grid), fetchBinary(terrain.files.surface)])
  if (!grid) throw new Error('grid unavailable')
  const encoding = { cols: terrain.cols, rows: terrain.rows, zMin: terrain.zMin, zUnit: terrain.zUnit, nodata: terrain.nodata }
  const heights = decodeGrid(grid, encoding)
  const surface = surfaceBuffer && terrain.surface
    ? decodeGrid(surfaceBuffer, { ...encoding, zMin: terrain.surface.zMin, zUnit: terrain.surface.zUnit })
    : null
  const { cols, rows, cellSizeM: cell } = terrain
  const meta: GridMeta = { west: terrain.west, north: terrain.north, step: terrain.step, cols, rows, cellSizeM: cell }
  let zMin = Infinity
  for (const z of heights) if (z < zMin) zMin = z
  const width = (cols - 1) * cell
  const depth = (rows - 1) * cell
  const frame: WindowFrame = { x0: width / 2, z0: depth / 2, zBase: Math.floor(zMin) - 1 }

  const factor = Math.max(1, Math.ceil(Math.sqrt((cols * rows) / OCCLUDER_BUDGET)))
  const coarse = downsample(surface ?? heights, cols, rows, factor)
  const occluder: WindowGround = { heights: coarse.heights, cols: coarse.cols, rows: coarse.rows, cellSize: cell * factor }

  const ground = bilinear(heights, cols, rows, cell)
  // The trees already on the land are in the picture itself: only the design is painted.
  const designed = growing ? { ...growing, plants: growing.plants.filter((p) => !p.existing) } : null
  const plants = designed ? scenePlants(meta, designed) : []
  const altitudes = Float32Array.from(plants, (p) => ground(p.x, p.y))
  return { meta, frame, occluder, ground, size: { width, depth }, plants, altitudes }
}

/** Bilinear height between the nodes, held to the edge outside the grid. */
export function bilinear(heights: ArrayLike<number>, cols: number, rows: number, cell: number): (x: number, z: number) => number {
  return (x, z) => {
    const fc = Math.min(cols - 1, Math.max(0, x / cell))
    const fr = Math.min(rows - 1, Math.max(0, z / cell))
    const c = Math.min(cols - 2, Math.floor(fc))
    const r = Math.min(rows - 2, Math.floor(fr))
    const tx = fc - c
    const tz = fr - r
    const i = r * cols + c
    const north = heights[i] * (1 - tx) + heights[i + 1] * tx
    const south = heights[i + cols] * (1 - tx) + heights[i + cols + 1] * tx
    return north * (1 - tz) + south * tz
  }
}

/** Metres outside the grid's rectangle (0 inside). */
export function outsideBy(x: number, z: number, size: { width: number; depth: number }): number {
  const dx = Math.max(0, -x, x - size.width)
  const dz = Math.max(0, -z, z - size.depth)
  return Math.hypot(dx, dz)
}
