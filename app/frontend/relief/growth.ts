// The map's plants growing in the 3D view: how big each one is, a given
// number of years after the garden's first planting, from its adult size
// in the catalogue and the years it takes to get there (Relief::GrowingPlants
// on the server). Pure functions, no three.js: tested in test/frontend/relief.
//
// Coordinates: metres on the relief grid (x east, y SOUTH), see grid.ts.

import type { Position } from 'geojson'
import { toGrid, type GridMeta } from './grid.ts'

export type PlantStrata = 'canopy' | 'sub_canopy' | 'shrub' | 'herbaceous' | 'ground_cover' | 'vine' | 'root' | 'aquatic'

/** What the server says of a species or cultivar on this map. */
export type GrowthInputs = {
  speciesId: number | null
  varietyId: number | null
  strata: PlantStrata
  name: string | null
  latinName: string | null
  foliage: string | null
  plantType: string | null
  heightM: number
  spreadM: number
  maturityYears: number
  /** Some of the values are a strata default or come from the growth rate. */
  indicative: boolean
}

export type GrowingPlantData = GrowthInputs & {
  id: number
  lng: number
  lat: number
  number: string | number | null
  ownName: string | null
  plantedOn: string | null
}

export type GrowingPatchData = {
  id: number
  name: string | null
  ring: Position[]
  lines: (GrowthInputs & { quantity: number; shown: number })[]
}

export type GrowingPlantsData = {
  today: string
  /** Year 0: the first planting, or today when nothing is planted yet. */
  origin: string
  plants: GrowingPlantData[]
  patches: GrowingPatchData[]
}

/** How a plant is drawn: a tree on its trunk, a bush, a low clump, a mat, a climber. */
export type PlantForm = 'tree' | 'bush' | 'clump' | 'mat' | 'climber'

/** One plant in the scene: where, what, and from when (years after year 0). */
export type ScenePlant = {
  x: number
  y: number
  form: PlantForm
  strata: PlantStrata
  heightM: number
  spreadM: number
  maturityYears: number
  /** Years after year 0 when it goes into the ground. */
  start: number
  /** Index in `GrowingPlantsData.plants`, or null for a plant of a patch. */
  plant: number | null
  /** The patch it belongs to (index in `patches`) and its line, for a plant of a patch. */
  patch: [number, number] | null
  /** A stable number per plant: its tint and the turn of its crown. */
  seed: number
}

/** The last year the slider reaches. */
export const GROWTH_YEARS = 20

/**
 * Size when planted (m): a bare-root whip, a one-year bush, a pot of
 * perennial. Never more than the adult size.
 */
export const PLANTING_SIZE: Record<PlantStrata, { height: number; spread: number }> = {
  canopy: { height: 1.6, spread: 0.5 },
  sub_canopy: { height: 1.3, spread: 0.5 },
  shrub: { height: 0.5, spread: 0.35 },
  herbaceous: { height: 0.15, spread: 0.2 },
  ground_cover: { height: 0.05, spread: 0.15 },
  vine: { height: 0.6, spread: 0.2 },
  root: { height: 0.1, spread: 0.15 },
  aquatic: { height: 0.2, spread: 0.2 },
}

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

/** Years from `from` to `to` (ISO dates), fractional. */
export function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS / YEAR_DAYS
}

/**
 * Share of the way from planting size to adult size, `age` years after
 * planting: a slow start while the roots settle, then fast, then levelling
 * off (Chapman-Richards). About 90 % at maturity, all of it soon after.
 */
export function growthShare(age: number, maturityYears: number): number {
  if (age <= 0) return 0
  const maturity = Math.max(1, maturityYears)
  return Math.min(1, Math.pow(1 - Math.exp((-3 * age) / maturity), 1.3) / 0.93)
}

/** Height and spread `age` years after planting, or null before it is planted. */
export function sizeAt(plant: Pick<ScenePlant, 'strata' | 'heightM' | 'spreadM' | 'maturityYears'>, age: number): { height: number; spread: number } | null {
  if (age < 0) return null
  const start = PLANTING_SIZE[plant.strata] ?? PLANTING_SIZE.shrub
  const adultHeight = Math.max(0.02, plant.heightM)
  const adultSpread = Math.max(0.05, plant.spreadM)
  const h0 = Math.min(start.height, adultHeight)
  const s0 = Math.min(start.spread, adultSpread)
  const share = growthShare(age, plant.maturityYears)
  return { height: h0 + (adultHeight - h0) * share, spread: s0 + (adultSpread - s0) * share }
}

/** The form a plant is drawn with, from its strata and its type. */
export function plantForm(strata: PlantStrata, plantType: string | null): PlantForm {
  if (strata === 'vine' || plantType === 'climber') return 'climber'
  if (strata === 'canopy' || strata === 'sub_canopy' || plantType === 'tree') return 'tree'
  if (strata === 'shrub' || plantType === 'shrub' || plantType === 'small-shrub') return 'bush'
  if (strata === 'ground_cover' || plantType === 'ground-cover') return 'mat'
  return 'clump'
}

/** A small seeded generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Whether a point is inside a ring (even-odd). */
export function insideRing(ring: { x: number; y: number }[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * `count` points spread evenly over a polygon, a little at random (a
 * jittered grid), always the same for a given seed: a patch's plants keep
 * their place from one year to the next.
 */
export function scatter(ring: { x: number; y: number }[], count: number, seed: number): { x: number; y: number }[] {
  if (count <= 0 || ring.length < 3) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x)
    minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y)
  }
  area = Math.abs(area) / 2
  if (area <= 0) return []
  const rand = random(seed)
  const points: { x: number; y: number }[] = []
  // Shrink the spacing until the grid holds enough points inside the ring.
  for (let spacing = Math.sqrt(area / count); points.length < count && spacing > 0.01; spacing *= 0.85) {
    points.length = 0
    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      for (let x = minX + spacing / 2; x < maxX; x += spacing) {
        const px = x + (rand() - 0.5) * spacing * 0.7
        const py = y + (rand() - 0.5) * spacing * 0.7
        if (insideRing(ring, px, py)) points.push({ x: px, y: py })
      }
    }
  }
  // Too many: keep an even selection.
  if (points.length <= count) return points
  const step = points.length / count
  return Array.from({ length: count }, (_, i) => points[Math.floor(i * step)])
}

/**
 * Every plant of the map on the grid: the plant points, and the plants of
 * each patch spread over it (less the points already placed in it for the
 * same species, which are drawn as themselves).
 */
export function scenePlants(meta: GridMeta, data: GrowingPlantsData): ScenePlant[] {
  const plants: ScenePlant[] = []
  const placed = data.plants.map((p) => ({ ...toGrid(meta, [p.lng, p.lat]), p }))
  const startOf = (date: string | null) => Math.max(0, yearsBetween(data.origin, date ?? data.today))
  placed.forEach(({ x, y, p }, index) => {
    plants.push({
      x, y, form: plantForm(p.strata, p.plantType), strata: p.strata, heightM: p.heightM, spreadM: p.spreadM,
      maturityYears: p.maturityYears, start: startOf(p.plantedOn), plant: index, patch: null, seed: p.id * 7919,
    })
  })
  const patchStart = startOf(null)
  data.patches.forEach((patch, patchIndex) => {
    const ring = patch.ring.map((position) => toGrid(meta, position))
    patch.lines.forEach((line, lineIndex) => {
      const already = placed.filter(({ x, y, p }) => p.speciesId != null && p.speciesId === line.speciesId
        && p.varietyId === line.varietyId && insideRing(ring, x, y)).length
      const count = Math.max(0, line.shown - already)
      for (const point of scatter(ring, count, patch.id * 131 + lineIndex * 17)) {
        plants.push({
          ...point, form: plantForm(line.strata, line.plantType), strata: line.strata, heightM: line.heightM,
          spreadM: line.spreadM, maturityYears: line.maturityYears, start: patchStart, plant: null,
          patch: [patchIndex, lineIndex], seed: Math.round(point.x * 1000 + point.y * 7),
        })
      }
    })
  })
  return plants
}

/** The calendar year of a year on the slider. */
export function calendarYear(origin: string, year: number): number {
  return new Date(origin).getUTCFullYear() + Math.floor(year)
}
