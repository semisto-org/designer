// Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
//
// The relief in blocks (3D view, base "Blocs"): the terrain in cubes of
// about 2 m, like a construction game. Grass, paths, water and forest floor
// from the land cover; trees (foliage, trunks under the crowns) and
// buildings (walls, roof) from the surface model, at their real height.
//
// The cubes stay cubic on screen whatever the exaggeration: the relief is
// quantised in DISPLAYED (exaggerated) height, one storey is one block. What
// stands above the ground (trees, roofs) counts in real metres, as elsewhere
// in the view.
//
// `buildBlocks` depends neither on three.js nor on the DOM: it returns arrays
// (positions, normals, texture coordinates in blocks, tile number) that the
// scene dresses. Hidden faces are not emitted; contiguous tops of a row and
// the sides of a column are merged.

import { ROLE } from './roles.ts'

export const TILES = {
  grass: 0, grassSide: 1, dirt: 2, stone: 3, gravel: 4, water: 5, podzol: 6, podzolSide: 7,
  leaves: 8, log: 9, logTop: 10, planks: 11, roof: 12,
} as const
export const ATLAS_COLUMNS = 8
export const ATLAS_ROWS = 2

const NONE = 0
const BUILDING = 1
const TREE = 2
const SHRUB = 3

/** The ground of a block from its land cover role: [top, side of the first layer]. */
function groundTiles(role: number): [number, number] {
  if (role === ROLE.road || role === ROLE.building) return [TILES.gravel, TILES.dirt]
  if (role === ROLE.water) return [TILES.water, TILES.water]
  if (role === ROLE.forest) return [TILES.podzol, TILES.podzolSide]
  return [TILES.grass, TILES.grassSide]
}

export type BlocksInput = {
  /** Real heights, designs dug in (m). */
  ground: Float32Array
  /** Bare terrain model (m). */
  original: Float32Array
  /** Surface model (trees and roofs), or null. */
  surface: Float32Array | null
  /** Land cover role per cell (see roles.ts), or null. */
  roles: Uint8Array | null
  cols: number
  rows: number
  /** Grid cell (m). */
  cell: number
  /** Block size (m). */
  block: number
  exaggeration: number
}

export type BuiltBlocks = {
  positions: Float32Array
  normals: Int8Array
  uvs: Uint16Array
  tiles: Uint8Array
  indices: Uint32Array
  /** Top of the ground of each block, in the exaggerated group's frame. */
  groundTops: Float32Array
  cols: number
  rows: number
  /** Block size (m). */
  size: number
  faces: number
}

/** `zBase`, `x0`, `z0`: the scene's height offset and half extent. */
export function buildBlocks(input: BlocksInput & { zBase: number; x0: number; z0: number }): BuiltBlocks {
  const { ground, original, surface, roles, cols, rows, cell, block, exaggeration, zBase, x0, z0 } = input
  const k = Math.max(1, Math.round(block / cell))
  const bc = Math.ceil(cols / k)
  const br = Math.ceil(rows / k)
  const count = bc * br
  const step = block / exaggeration       // one storey in the exaggerated group's frame

  const top = new Int16Array(count)        // first empty storey above the ground
  const kind = new Uint8Array(count)
  const height = new Uint8Array(count)     // storeys above the ground (tree, building)
  const leafStart = new Int16Array(count)
  const trunk = new Uint8Array(count)
  const above = new Float32Array(count)
  const cover = new Uint8Array(count)
  const roof = new Uint8Array(count)
  const built = new Uint8Array(count)      // buildings of the land cover in the block
  let minTop = Infinity

  for (let j = 0; j < br; j++) {
    for (let i = 0; i < bc; i++) {
      let sum = 0
      let n = 0
      let tallest = 0
      let rough = 0
      let roughCount = 0
      for (let r = j * k; r < Math.min(rows, j * k + k); r++) {
        for (let c = i * k; c < Math.min(cols, i * k + k); c++) {
          const index = r * cols + c
          sum += ground[index]
          n++
          if (roles && roles[index] === ROLE.building) built[j * bc + i] = 1
          if (!surface) continue
          tallest = Math.max(tallest, surface[index] - original[index])
          if (r > 0 && c > 0 && r < rows - 1 && c < cols - 1) {
            rough += Math.abs(4 * surface[index] - surface[index - 1] - surface[index + 1] - surface[index - cols] - surface[index + cols])
            roughCount++
          }
        }
      }
      const b = j * bc + i
      const centre = Math.min(rows - 1, j * k + (k >> 1)) * cols + Math.min(cols - 1, i * k + (k >> 1))
      top[b] = Math.round(((sum / n - zBase) * exaggeration) / block)
      above[b] = tallest
      // A roof is smooth (a plane, two slopes), a crown bumpy: the mean
      // curvature of the surface model tells them apart (roofs 0.3 to 2 m,
      // forest ~7 m). Safer than the land cover, which sometimes classes the
      // yard as built and the roofs around it as broadleaves.
      roof[b] = tallest > 2.5 && tallest < 18 && roughCount > 0 && rough / roughCount < 3 ? 1 : 0
      cover[b] = roles ? roles[centre] : ROLE.none
      if (top[b] < minTop) minTop = top[b]
    }
  }

  // A building has open ground a few metres away; a smooth patch in the
  // heart of a forest (dense conifers, coppice) has none: not a roof.
  const isolated = new Uint8Array(count)
  for (let j = 0; j < br; j++) {
    for (let i = 0; i < bc; i++) {
      const b = j * bc + i
      if (!roof[b]) continue
      let open = 0
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const ni = i + di
          const nj = j + dj
          if (ni >= 0 && nj >= 0 && ni < bc && nj < br && above[nj * bc + ni] < 1) open++
        }
      }
      if (open < 4) isolated[b] = 1
    }
  }
  for (let b = 0; b < count; b++) if (isolated[b]) roof[b] = 0
  // And a building is at least 24 m² in one piece (a lone tree with a smooth
  // crown is not) and touches, within 6 m, a building of the land cover (a
  // trimmed hedge, smooth as well, does not). Without land cover, the size
  // is enough.
  const nearBuilt = (members: number[]) => {
    if (!roles) return true
    for (const b of members) {
      const i = b % bc
      const j = (b - i) / bc
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          const ni = i + di
          const nj = j + dj
          if (ni >= 0 && nj >= 0 && ni < bc && nj < br && built[nj * bc + ni]) return true
        }
      }
    }
    return false
  }
  const seen = new Uint8Array(count)
  const stack: number[] = []
  const members: number[] = []
  for (let start = 0; start < count; start++) {
    if (!roof[start] || seen[start]) continue
    members.length = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const b = stack.pop() as number
      members.push(b)
      const i = b % bc
      for (const o of [i > 0 ? b - 1 : -1, i < bc - 1 ? b + 1 : -1, b - bc, b + bc]) {
        if (o >= 0 && o < count && roof[o] && !seen[o]) { seen[o] = 1; stack.push(o) }
      }
    }
    if (members.length * k * k * cell * cell < 24 || !nearBuilt(members)) for (const b of members) roof[b] = 0
  }

  // The canopy smoothed over 5 × 5 blocks: a forest in plateaus, as in the
  // game, rather than a step at every block (and four times fewer faces).
  const canopy = new Float32Array(count)
  for (let j = 0; j < br; j++) {
    for (let i = 0; i < bc; i++) {
      const b = j * bc + i
      if (above[b] <= 2.5 || roof[b]) { canopy[b] = above[b]; continue }
      let sum = 0
      let n = 0
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || nj < 0 || ni >= bc || nj >= br) continue
          const o = nj * bc + ni
          if (above[o] > 2.5 && !roof[o]) { sum += above[o]; n++ }
        }
      }
      canopy[b] = sum / n
    }
  }
  for (let b = 0; b < count; b++) {
    const a = canopy[b]
    if (a > 2.5) {
      kind[b] = roof[b] ? BUILDING : TREE
      height[b] = Math.min(40, Math.max(1, Math.round(a / block)))
    } else if (a >= 1 && cover[b] !== ROLE.road && cover[b] !== ROLE.building && cover[b] !== ROLE.water) {
      kind[b] = SHRUB
      height[b] = 1
    }
  }
  // A trunk under each crown top (the highest foliage of its neighbourhood),
  // the foliage of a 1 to 3 storey crown over it.
  for (let j = 0; j < br; j++) {
    for (let i = 0; i < bc; i++) {
      const b = j * bc + i
      if (kind[b] !== TREE) continue
      const depth = Math.min(3, Math.max(1, Math.round(height[b] * 0.4)))
      leafStart[b] = top[b] + height[b] - depth
      let peak = true
      for (let dj = -1; dj <= 1 && peak; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || nj < 0 || ni >= bc || nj >= br) continue
          const o = nj * bc + ni
          if (above[o] > above[b] || (above[o] === above[b] && o < b)) { peak = false; break }
        }
      }
      trunk[b] = peak ? 1 : 0
    }
  }

  const floor = minTop - 4
  const columnTop = (b: number) => (kind[b] === NONE ? top[b] : top[b] + height[b])
  const solid = (b: number, level: number) => {
    if (level < floor) return false
    if (level < top[b]) return true
    const k2 = kind[b]
    if (k2 === NONE || level >= top[b] + height[b]) return false
    if (k2 === TREE) return level >= leafStart[b] || trunk[b] === 1
    return true
  }
  // The tile of a face from what it covers.
  const sideTile = (b: number, level: number): number => {
    if (level >= top[b]) {
      if (kind[b] === BUILDING) return TILES.planks
      if (kind[b] === TREE && level < leafStart[b]) return TILES.log
      return TILES.leaves
    }
    const depth = top[b] - 1 - level
    if (depth === 0) return groundTiles(cover[b])[1]
    return depth < 4 ? TILES.dirt : TILES.stone
  }
  const topTile = (b: number, level: number): number => {
    if (level >= top[b]) {
      if (kind[b] === BUILDING) return TILES.roof
      if (kind[b] === TREE && level < leafStart[b]) return TILES.logTop
      return TILES.leaves
    }
    return level === top[b] - 1 ? groundTiles(cover[b])[0] : TILES.dirt
  }

  const out = new FaceBuffer(Math.max(1 << 16, count * 3))
  const half = cell / 2
  const left = (i: number) => i * k * cell - half - x0
  const right = (i: number) => Math.min(cols, (i + 1) * k) * cell - half - x0
  const north = (j: number) => j * k * cell - half - z0
  const south = (j: number) => Math.min(rows, (j + 1) * k) * cell - half - z0
  const neighbours = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]] as const   // +x, -x, +z, -z

  type Run = { start: number; end: number; level: number; tile: number; up: boolean }
  for (let j = 0; j < br; j++) {
    // The tops (and the undersides of the foliage) of a row, merged along x:
    // direction|storey|tile → start.
    const runs = new Map<number, Run>()
    const flush = (key: number, run: Run) => {
      if (run.up) out.top(left(run.start), right(run.end), north(j), south(j), (run.level + 1) * step, run.tile)
      else out.bottom(left(run.start), right(run.end), north(j), south(j), run.level * step, run.tile)
      runs.delete(key)
    }
    const extend = (i: number, level: number, tile: number, up: boolean) => {
      const key = (level * 16 + tile) * 2 + (up ? 1 : 0)
      const run = runs.get(key)
      if (run && run.end === i - 1) { run.end = i; return }
      if (run) flush(key, run)
      runs.set(key, { start: i, end: i, level, tile, up })
    }
    for (let i = 0; i < bc; i++) {
      const b = j * bc + i
      const highest = columnTop(b)

      // The tops (and undersides of floating foliage).
      for (let level = floor; level < highest; level++) {
        if (level < top[b] - 1) { level = top[b] - 2; continue }
        if (!solid(b, level)) continue
        if (!solid(b, level + 1)) extend(i, level, topTile(b, level), true)
        if (level > floor && level >= top[b] && !solid(b, level - 1)) extend(i, level, topTile(b, level), false)
      }

      // The sides, merged along the column.
      for (const [di, dj, face] of neighbours) {
        const ni = i + di
        const nj = j + dj
        const outside = ni < 0 || nj < 0 || ni >= bc || nj >= br
        const o = outside ? -1 : nj * bc + ni
        const from = outside ? floor : Math.max(floor, Math.min(top[b], top[o]))
        let runStart: number | null = null
        let runTile = -1
        const emit = (end: number) => {
          if (runStart === null) return
          out.side(face, left(i), right(i), north(j), south(j), runStart * step, end * step, end - runStart, runTile)
          runStart = null
        }
        for (let level = from; level < highest; level++) {
          const exposed = solid(b, level) && (outside || !solid(o, level))
          const tile = exposed ? sideTile(b, level) : -1
          if (!exposed || tile !== runTile) emit(level)
          if (exposed && runStart === null) { runStart = level; runTile = tile }
        }
        emit(highest)
      }
    }
    for (const [key, run] of runs) flush(key, run)
  }

  // The top of the ground of each block, in the exaggerated frame: where the
  // Niva stands.
  const groundTops = new Float32Array(count)
  for (let b = 0; b < count; b++) groundTops[b] = top[b] * step

  return { ...out.arrays(), groundTops, cols: bc, rows: br, size: k * cell, faces: out.faces }
}

/** Growing typed arrays: four vertices and six indices per face. */
class FaceBuffer {
  capacity: number
  faces = 0
  positions: Float32Array
  normals: Int8Array
  uvs: Uint16Array
  tiles: Uint8Array

  constructor(faces: number) {
    this.capacity = faces
    this.positions = new Float32Array(faces * 12)
    this.normals = new Int8Array(faces * 12)
    this.uvs = new Uint16Array(faces * 8)
    this.tiles = new Uint8Array(faces * 4)
  }

  private grow() {
    this.capacity *= 2
    const grown = <T extends Float32Array | Int8Array | Uint16Array | Uint8Array>(array: T, next: T) => { next.set(array); return next }
    this.positions = grown(this.positions, new Float32Array(this.capacity * 12))
    this.normals = grown(this.normals, new Int8Array(this.capacity * 12))
    this.uvs = grown(this.uvs, new Uint16Array(this.capacity * 8))
    this.tiles = grown(this.tiles, new Uint8Array(this.capacity * 4))
  }

  /** Four corners counter-clockwise seen from outside, their coordinates in blocks, a normal. */
  private quad(corners: number[], uv: number[], normal: number[], tile: number) {
    if (this.faces === this.capacity) this.grow()
    const f = this.faces++
    this.positions.set(corners, f * 12)
    this.uvs.set(uv, f * 8)
    for (let v = 0; v < 4; v++) {
      this.normals.set(normal, f * 12 + v * 3)
      this.tiles[f * 4 + v] = tile
    }
  }

  top(xa: number, xb: number, za: number, zb: number, y: number, tile: number) {
    const u = Math.round((xb - xa) / (zb - za)) || 1
    this.quad([xa, y, za, xa, y, zb, xb, y, zb, xb, y, za], [0, 0, 0, 1, u, 1, u, 0], [0, 127, 0], tile)
  }

  bottom(xa: number, xb: number, za: number, zb: number, y: number, tile: number) {
    const u = Math.round((xb - xa) / (zb - za)) || 1
    this.quad([xa, y, za, xb, y, za, xb, y, zb, xa, y, zb], [0, 0, u, 0, u, 1, 0, 1], [0, -127, 0], tile)
  }

  /** `face`: 0 = east (+x), 1 = west (−x), 2 = south (+z), 3 = north (−z); `levels` storeys high, from `ya` to `yb`. */
  side(face: number, xa: number, xb: number, za: number, zb: number, ya: number, yb: number, levels: number, tile: number) {
    const uv = [0, 0, 1, 0, 1, levels, 0, levels]
    if (face === 0) this.quad([xb, ya, zb, xb, ya, za, xb, yb, za, xb, yb, zb], uv, [127, 0, 0], tile)
    else if (face === 1) this.quad([xa, ya, za, xa, ya, zb, xa, yb, zb, xa, yb, za], uv, [-127, 0, 0], tile)
    else if (face === 2) this.quad([xa, ya, zb, xb, ya, zb, xb, yb, zb, xa, yb, zb], uv, [0, 0, 127], tile)
    else this.quad([xb, ya, za, xa, ya, za, xa, yb, za, xb, yb, za], uv, [0, 0, -127], tile)
  }

  arrays() {
    const f = this.faces
    const indices = new Uint32Array(f * 6)
    for (let i = 0; i < f; i++) {
      const v = i * 4
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6)
    }
    return {
      positions: this.positions.slice(0, f * 12),
      normals: this.normals.slice(0, f * 12),
      uvs: this.uvs.slice(0, f * 8),
      tiles: this.tiles.slice(0, f * 4),
      indices,
    }
  }
}

// ---- The textures ----------------------------------------------------------
//
// 16 × 16 pixel art drawn here with a seeded random (same seed, same
// drawing): no file, nothing copied. Returns the sheet and the mean colour of
// each tile (to blend distant blocks, where 16 pixels turn into noise).

export function blockAtlas(): { canvas: HTMLCanvasElement; averages: Float32Array } {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLUMNS * size
  canvas.height = ATLAS_ROWS * size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const random = seeded(48151623)
  const pick = (palette: string[]) => palette[Math.floor(random() * palette.length)]

  const GRASS = ['#5c8f33', '#518229', '#68a03c', '#4a7726', '#5f9536']
  const DIRT = ['#7b5636', '#6c4a2e', '#87603d', '#5f4229']
  const STONE = ['#7f7f7f', '#737373', '#8b8b8b', '#6a6a6a']
  const GRAVEL = ['#9b9288', '#867d74', '#aba298', '#78716a', '#938a7f']
  const WATER = ['#2f60b4', '#3568c1', '#2b57a4', '#3b6fc7']
  const PODZOL = ['#4f5f2a', '#58592c', '#46592a', '#5a512c', '#516630']
  const LEAVES = ['#2f6c20', '#285d1b', '#3a7b27', '#21501a']
  const BARK = ['#5c4227', '#4b3521', '#6a4c2d', '#553c24']
  const PLANKS = ['#a77e4d', '#9c7446', '#b08752', '#a07849']
  const ROOF = ['#7b3c2f', '#86443a', '#713529', '#8b4a3c']

  const tile = (index: number, draw: (x: number, y: number) => string) => {
    const ox = (index % ATLAS_COLUMNS) * size
    const oy = Math.floor(index / ATLAS_COLUMNS) * size
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = draw(x, y)
        ctx.fillRect(ox + x, oy + y, 1, 1)
      }
    }
  }
  // The grassy edge of a side: three rows, a fourth fringed.
  const fringe = (palette: string[], under: string[]) => (_x: number, y: number) => (y < 3 || (y === 3 && random() < 0.5) ? pick(palette) : pick(under))

  tile(TILES.grass, () => pick(GRASS))
  tile(TILES.grassSide, fringe(GRASS, DIRT))
  tile(TILES.dirt, () => pick(DIRT))
  tile(TILES.stone, () => (random() < 0.08 ? '#585858' : pick(STONE)))
  tile(TILES.gravel, () => pick(GRAVEL))
  tile(TILES.water, () => (random() < 0.06 ? '#6592da' : pick(WATER)))
  tile(TILES.podzol, () => pick(PODZOL))
  tile(TILES.podzolSide, fringe(PODZOL, DIRT))
  tile(TILES.leaves, () => (random() < 0.14 ? '#183c11' : pick(LEAVES)))
  tile(TILES.log, (x) => (x % 4 === 0 ? '#3f2c1b' : pick(BARK)))
  tile(TILES.logTop, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5)
    if (d > 6.6) return pick(BARK)
    return Math.floor(d) % 2 ? '#a17b4b' : '#8b6739'
  })
  tile(TILES.planks, (x, y) => (y % 4 === 3 || (x === ((Math.floor(y / 4) * 5) % 16)) ? '#6f5333' : pick(PLANKS)))
  tile(TILES.roof, (_x, y) => (y % 4 === 3 ? '#5c2b22' : pick(ROOF)))

  const averages = new Float32Array(ATLAS_COLUMNS * ATLAS_ROWS * 3)
  for (let t = 0; t < ATLAS_COLUMNS * ATLAS_ROWS; t++) {
    const data = ctx.getImageData((t % ATLAS_COLUMNS) * size, Math.floor(t / ATLAS_COLUMNS) * size, size, size).data
    let r = 0; let g = 0; let b = 0
    for (let p = 0; p < data.length; p += 4) { r += data[p]; g += data[p + 1]; b += data[p + 2] }
    const n = (data.length / 4) * 255
    averages.set([r / n, g / n, b / n], t * 3)
  }
  return { canvas, averages }
}

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
