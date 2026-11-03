// The buildings of a region's 3D model (UrbIS Buildings 3D in Brussels):
// measured roofs, not guessed ones. The server sends each building's
// footprint and its roof surfaces, every corner with its height above the
// building's ground; here they become a shell for the scene (the roof's
// planar polygons, and a wall under each free edge of the roof down to the
// ground) and the height of the roof over any point, for the shadows and
// the blocks. No import of three.js.

import type { Point, RoofPoint, Shell } from './roofs.ts'

/** A roof surface: its outer ring then its holes, each point [lng, lat, height above the ground]. */
export type ModelRoof = Array<Array<[number, number, number]>>

/** One building of the model as the server sends it. */
export type ModelData = { id: string; rings: Array<Array<[number, number]>>; roofs: ModelRoof[]; height: number }

/** The roof as a person would describe it, for « Régler son toit ». */
export type RoofKind = 'pitched' | 'hip' | 'shed' | 'flat'

type Plane = { nx: number; ny: number; nz: number; d: number }

// A slope under ~8° reads as flat.
const FLAT_COS = Math.cos((8 * Math.PI) / 180)

/** Newell's normal of a planar polygon, and its plane. */
function plane(ring: RoofPoint[]): Plane {
  let [nx, ny, nz] = [0, 0, 0]
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]
    const b = ring[(k + 1) % ring.length]
    nx += (a.y - b.y) * (a.h + b.h)
    ny += (a.h - b.h) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  const length = Math.hypot(nx, ny, nz) || 1
  ;[nx, ny, nz] = [nx / length, ny / length, nz / length]
  const c = ring.reduce((acc, p) => ({ x: acc.x + p.x / ring.length, y: acc.y + p.y / ring.length, h: acc.h + p.h / ring.length }), { x: 0, y: 0, h: 0 })
  return { nx, ny, nz, d: nx * c.x + ny * c.y + nz * c.h }
}

function open<T extends Point>(ring: T[]): T[] {
  const last = ring[ring.length - 1]
  return ring.length > 1 && ring[0].x === last.x && ring[0].y === last.y ? ring.slice(0, -1) : ring
}

function inside(ring: Point[], p: Point): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[i], ring[j]]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

const key = (p: RoofPoint) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.h.toFixed(2)}`

/**
 * The model's roof in grid metres (`toGrid` turns [lng, lat] into the
 * grid): its polygons, and the edges no other surface shares, where a wall
 * stands (outer walls, steps between two roof levels, a light well).
 */
export function modelShell(roofs: ModelRoof[], footprint: Point[], toGrid: (p: [number, number]) => Point): Shell {
  const polygons = roofs
    .map(([outer, ...holes]) => ({
      outer: open(outer.map(([lng, lat, h]) => ({ ...toGrid([lng, lat]), h }))),
      holes: holes.map((hole) => open(hole.map(([lng, lat, h]) => ({ ...toGrid([lng, lat]), h })))),
    }))
    .filter((polygon) => polygon.outer.length >= 3)
  const edges = new Map<string, [RoofPoint, RoofPoint]>()
  for (const polygon of polygons) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let k = 0; k < ring.length; k++) {
        const [a, b] = [ring[k], ring[(k + 1) % ring.length]]
        const [ka, kb] = [key(a), key(b)]
        if (ka === kb) continue
        // Shared by two surfaces (a ridge, a valley): no wall under it.
        const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        if (edges.has(id)) edges.delete(id)
        else edges.set(id, [a, b])
      }
    }
  }
  return { ring: open(footprint).map((p) => ({ ...p, top: 0 })), faces: [], polygons, edges: [...edges.values()] }
}

/** Planes of a shell's roof polygons, for `modelHeight`. */
export function modelPlanes(shell: Shell): Array<{ polygon: { outer: RoofPoint[]; holes: RoofPoint[][] }; plane: Plane; box: [number, number, number, number] }> {
  return (shell.polygons ?? []).map((polygon) => {
    const xs = polygon.outer.map((p) => p.x)
    const ys = polygon.outer.map((p) => p.y)
    return { polygon, plane: plane(polygon.outer), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
  })
}

/** The roof's height above the base over a point (the highest surface there), or null off the roof. */
export function modelHeight(planes: ReturnType<typeof modelPlanes>, p: Point): number | null {
  let top: number | null = null
  for (const { polygon, plane: { nx, ny, nz, d }, box } of planes) {
    if (p.x < box[0] || p.x > box[2] || p.y < box[1] || p.y > box[3]) continue
    if (!inside(polygon.outer, p) || polygon.holes.some((hole) => inside(hole, p))) continue
    // A near-vertical surface (a dormer's cheek): its highest corner.
    const h = Math.abs(nz) > 0.05 ? (d - nx * p.x - ny * p.y) / nz : Math.max(...polygon.outer.map((q) => q.h))
    if (top === null || h > top) top = h
  }
  return top
}

/**
 * The roof as a simple shape, when a person takes the building over to
 * change it: flat, a single slope, two slopes, or more.
 */
export function roofKind(shell: Shell): RoofKind {
  const directions = new Set<number>()
  let area = 0
  for (const { outer } of shell.polygons ?? []) {
    const { nx, ny, nz } = plane(outer)
    if (Math.abs(nz) >= FLAT_COS) continue
    // Grid y points south: the slope's facing, in quarters.
    directions.add(((Math.round(Math.atan2(nx, -ny) / (Math.PI / 2)) % 4) + 4) % 4)
    area++
  }
  if (!area) return 'flat'
  if (directions.size === 1) return 'shed'
  if (directions.size === 2) return 'pitched'
  return 'hip'
}
