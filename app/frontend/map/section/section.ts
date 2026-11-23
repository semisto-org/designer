// « Coupe dans le temps »: the section the server cuts along a line
// (Relief::Section), laid out as a drawing. Pure functions, tested in
// test/frontend/section.

export type SectionMoment = 'today' | 'year5' | 'year15' | 'year30'
export const SECTION_MOMENTS: readonly SectionMoment[] = ['today', 'year5', 'year15', 'year30']

export type SectionSize = { h: number; s: number }
export type SectionPlant = {
  id: number
  name?: string
  latinName?: string
  code?: string
  strata: string
  existing?: boolean
  planted?: boolean
  /** deciduous, evergreen, semi_evergreen, marcescent (from its sheet), absent when unknown. */
  foliage?: string
  indicative?: boolean
  /** Distance along the line (m), and to the line (m, left positive). */
  d: number
  offset: number
  /** The ground at its foot (m), absent without relief. */
  z?: number | null
  adult: SectionSize
  sizes: Record<SectionMoment, SectionSize | null>
}
export type SectionCrossing = {
  id: number; layer: string; kind: string; name?: string; planned?: boolean; from: number; to: number
  /** Noted on the element: how wide and how deep it is dug (m). */
  widthM?: number; depthM?: number
  /** A hedge's height (m) at each moment. */
  hedge?: Record<SectionMoment, number>
}
export type SectionData = {
  line: [number, number][]
  lengthM: number
  corridorM: number
  origin: string
  moments: { key: SectionMoment; year: number | null; calendarYear: number }[]
  relief: 'terrain' | 'flat'
  ground: { d: number; z: number | null }[]
  plants: SectionPlant[]
  crossings: SectionCrossing[]
  /** Direction of the line, start to end, in degrees from north. */
  bearing: number
}

/** Kinds drawn as water cut into the ground. */
const WATER_KINDS = new Set(['swale', 'pond', 'ditch', 'stream', 'rain_garden', 'basin', 'mare', 'water_body', 'retention_pond'])
export const isWaterCrossing = (c: SectionCrossing) => c.layer === 'water' && (WATER_KINDS.has(c.kind) || c.to - c.from > 0.2)

export type SectionLayout = {
  width: number
  height: number
  /** Left and right margins, top band (labels) and bottom band (axis). */
  left: number
  right: number
  top: number
  bottom: number
  /** Metres to pixels, along and up. */
  sx: number
  sy: number
  /** How much heights are stretched against lengths (1 = true scale). */
  exaggeration: number
  zMin: number
  x: (d: number) => number
  y: (z: number) => number
  groundAt: (d: number) => number
}

const MIN_FILL = 0.5

/**
 * Scales of the drawing: lengths fill the width; heights at the same scale
 * when the tallest plant fills at least half the height, else stretched
 * (and the sheet says so), so a 400 m section still shows its trees.
 */
export function sectionLayout(data: SectionData, width: number, height: number): SectionLayout {
  const left = 44
  const right = 20
  const top = 70
  const bottom = 46
  const known = data.ground.filter((g) => g.z != null).map((g) => g.z as number)
  const zMin = known.length ? Math.min(...known) : 0
  const zMax = known.length ? Math.max(...known) : 0
  const tallest = Math.max(2,
    ...data.plants.map((p) => Math.max(p.adult.h, ...Object.values(p.sizes).map((s) => s?.h ?? 0)) + ((p.z ?? zMin) - zMin)),
    ...data.crossings.map((c) => (c.hedge ? Math.max(...Object.values(c.hedge)) : 0) + (zMax - zMin)))
  const sx = (width - left - right) / Math.max(1, data.lengthM)
  // Room under the ground line for a slice of soil, and above for the tallest crown.
  const soil = 14
  const span = Math.max(tallest, zMax - zMin + 2)
  const fit = (height - top - bottom - soil) / span
  // True scale while the tallest crown fills at least half the height; stretched beyond.
  const sy = Math.min(fit, Math.max(sx, fit * MIN_FILL))
  const base = height - bottom - soil
  const y = (z: number) => base - (z - zMin) * sy
  const x = (d: number) => left + d * sx
  const groundAt = (d: number) => groundHeight(data, d) ?? zMin
  return { width, height, left, right, top, bottom, sx, sy, exaggeration: sy / sx, zMin, x, y, groundAt }
}

/** The ground's height at a distance along the line, between samples; null without relief. */
export function groundHeight(data: Pick<SectionData, 'ground'>, d: number): number | null {
  const g = data.ground
  if (!g.length) return null
  let i = 0
  while (i < g.length - 2 && g[i + 1].d < d) i++
  const a = g[i]
  const b = g[Math.min(i + 1, g.length - 1)]
  if (a.z == null && b.z == null) return null
  if (a.z == null) return b.z
  if (b.z == null || b.d === a.d) return a.z
  const t = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d)))
  return a.z + (b.z - a.z) * t
}

/** The ground line as an SVG path, and the same closed down to the bottom (the soil). */
export function groundPaths(data: SectionData, layout: SectionLayout): { line: string; soil: string } {
  const points = data.ground.length ? data.ground : [{ d: 0, z: null }, { d: data.lengthM, z: null }]
  const coords = points.map((p) => [layout.x(p.d), layout.y(p.z ?? layout.groundAt(p.d))] as const)
  const line = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  const floor = layout.height - layout.bottom
  const first = coords[0]
  const last = coords[coords.length - 1]
  return { line, soil: `${line} L${last[0].toFixed(1)} ${floor} L${first[0].toFixed(1)} ${floor} Z` }
}

const TREE_STRATA = new Set(['canopy', 'sub_canopy'])

/**
 * A plant's silhouette in the section: a trunk and an ellipse of crown for
 * a tree, a dome sitting on the ground for a shrub or a perennial, a thin
 * stem for a climber. Pixels, with the top of the crown.
 */
export function plantShape(plant: Pick<SectionPlant, 'strata' | 'd' | 'z'>, size: SectionSize, layout: SectionLayout) {
  const foot = layout.y(plant.z ?? layout.groundAt(plant.d))
  const cx = layout.x(plant.d)
  const h = Math.max(0.05, size.h) * layout.sy
  const rx = Math.max(1.2, (size.s / 2) * layout.sx)
  if (plant.strata === 'vine') return { kind: 'stem' as const, cx, foot, top: foot - h, rx: Math.max(1.5, rx * 0.4), ry: h / 2, cy: foot - h / 2, trunk: 0 }
  if (TREE_STRATA.has(plant.strata)) {
    // A young tree is mostly stem; a grown one carries its crown on about a third of its height.
    const trunk = h * (size.h < 3 ? 0.45 : 0.32)
    const ry = (h - trunk) / 2
    return { kind: 'tree' as const, cx, foot, top: foot - h, rx, ry, cy: foot - trunk - ry, trunk }
  }
  return { kind: 'dome' as const, cx, foot, top: foot - h, rx, ry: h, cy: foot, trunk: 0 }
}

/** Share (0 to 1) of the section's length under at least one crown of a tree at that moment. */
export function canopyShare(data: SectionData, moment: SectionMoment): number {
  const spans = data.plants
    .filter((p) => TREE_STRATA.has(p.strata))
    .flatMap((p) => { const s = p.sizes[moment]; return s ? [[Math.max(0, p.d - s.s / 2), Math.min(data.lengthM, p.d + s.s / 2)] as const] : [] })
    .sort((a, b) => a[0] - b[0])
  let covered = 0
  let end = -Infinity
  for (const [from, to] of spans) {
    if (to <= end) continue
    covered += to - Math.max(from, end)
    end = to
  }
  return data.lengthM > 0 ? covered / data.lengthM : 0
}

/** The tallest plant at a moment, or null. */
export function tallestAt(data: SectionData, moment: SectionMoment): { plant: SectionPlant; h: number } | null {
  let best: { plant: SectionPlant; h: number } | null = null
  for (const plant of data.plants) {
    const h = plant.sizes[moment]?.h ?? 0
    if (h > (best?.h ?? 0)) best = { plant, h }
  }
  return best
}

/** The first tree whose crown reaches over a water crossing at that moment, with that crossing. */
export function crownOverWater(data: SectionData, moment: SectionMoment): { plant: SectionPlant; crossing: SectionCrossing } | null {
  for (const crossing of data.crossings.filter(isWaterCrossing)) {
    const mid = (crossing.from + crossing.to) / 2
    const plant = data.plants
      .filter((p) => TREE_STRATA.has(p.strata) && p.sizes[moment])
      .find((p) => Math.abs(p.d - mid) < (p.sizes[moment] as SectionSize).s / 2)
    if (plant) return { plant, crossing }
  }
  return null
}

/** Drop of the ground from start to end (m, positive when the end is lower), null without relief. */
export function groundDrop(data: SectionData): number | null {
  const known = data.ground.filter((g) => g.z != null)
  if (known.length < 2) return null
  return (known[0].z as number) - (known[known.length - 1].z as number)
}

/**
 * Where the noon sun comes from in the plane of the section, for the two
 * solstices: the side (start or end of the line) and its apparent angle
 * above the ground. Null when the line runs east-west (the sun stays beside
 * it at noon) or the sun is under the horizon.
 */
export function noonSunInSection(bearing: number, lat: number): { from: 'start' | 'end'; june: number; december: number } | null {
  const sunAzimuth = lat >= 0 ? 180 : 0
  const along = Math.cos(((sunAzimuth - bearing) * Math.PI) / 180)
  if (Math.abs(along) < 0.3) return null
  const apparent = (elevation: number) => (Math.atan(Math.tan((elevation * Math.PI) / 180) / Math.abs(along)) * 180) / Math.PI
  const june = 90 - Math.abs(lat - 23.44)
  const december = 90 - Math.abs(lat + 23.44)
  if (december <= 0) return null
  // The sun lies ahead along the line (towards the end) when `along` is positive.
  return { from: along > 0 ? 'end' : 'start', june: apparent(june), december: apparent(december) }
}

/** Round ticks along the line for the axis: [0, 10, 20…] in metres. */
export function distanceTicks(length: number, target = 6): number[] {
  const raw = length / target
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.001)))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const ticks: number[] = []
  for (let v = 0; v <= length + 1e-6; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

/** Labels laid on rows so that none overlaps the previous one on its row: the row of each, in order. */
export function labelRows(spans: { x: number; width: number }[], rows = 4, gap = 6): number[] {
  const ends = new Array(rows).fill(-Infinity)
  return spans.map(({ x, width }) => {
    let row = ends.findIndex((end) => x - width / 2 >= end + gap)
    if (row < 0) row = ends.indexOf(Math.min(...ends))
    ends[row] = x + width / 2
    return row
  })
}

/** `line` query value for the section endpoint and editor links: "lng,lat;lng,lat". */
export const lineParam = (line: [number, number][]) => line.map(([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)}`).join(';')

/** The same, read back (from an editor link), or null. */
export function parseLineParam(value: string | null): [number, number][] | null {
  if (!value) return null
  const points = value.split(';').map((pair) => pair.split(',').map(Number) as [number, number])
  return points.length >= 2 && points.every((p) => p.length === 2 && p.every(Number.isFinite)) ? points : null
}

/**
 * The shadow a plant casts along the section at solar noon on a solstice:
 * from its foot to where the ray grazing its top meets flat ground, away from
 * the sun. True geometry in metres (the drawing stretches it with the heights).
 */
export function noonShadow(plant: Pick<SectionPlant, 'd'>, height: number, sun: { from: 'start' | 'end'; june: number; december: number }, season: 'june' | 'december') {
  const reach = height / Math.tan((sun[season] * Math.PI) / 180)
  const sign = sun.from === 'start' ? 1 : -1
  return { from: plant.d, to: plant.d + sign * reach, reach }
}

/** The tallest tree's December noon shadow, and the first named thing it reaches beyond its crown. */
export function winterShadow(data: SectionData, moment: SectionMoment, lat: number) {
  const sun = noonSunInSection(data.bearing, lat)
  const tallest = tallestAt(data, moment)
  if (!sun || !tallest || !TREE_STRATA.has(tallest.plant.strata) || tallest.h < 2) return null
  const shadow = noonShadow(tallest.plant, tallest.h, sun, 'december')
  const [lo, hi] = [Math.min(shadow.from, shadow.to), Math.max(shadow.from, shadow.to)]
  const crown = (tallest.plant.sizes[moment]?.s ?? 0) / 2
  const reaches = data.crossings
    .filter((c) => c.name && c.to >= lo && c.from <= hi && Math.min(Math.abs(c.from - tallest.plant.d), Math.abs(c.to - tallest.plant.d)) > crown)
    .sort((a, b) => Math.abs(a.from - tallest.plant.d) - Math.abs(b.from - tallest.plant.d))[0] ?? null
  return { plant: tallest.plant, height: tallest.h, reach: shadow.reach, reaches }
}

/** The longest stretch of the line with no crown over it, even adult, when it is long enough to say so. */
export function emptyStretch(data: SectionData): { from: number; to: number } | null {
  const spans = data.plants.map((p) => [p.d - p.adult.s / 2, p.d + p.adult.s / 2] as const).sort((a, b) => a[0] - b[0])
  let best = { from: 0, to: 0 }
  let cursor = 0
  for (const [from, to] of spans) {
    if (from - cursor > best.to - best.from) best = { from: cursor, to: from }
    cursor = Math.max(cursor, to)
  }
  if (data.lengthM - cursor > best.to - best.from) best = { from: cursor, to: data.lengthM }
  const length = best.to - best.from
  return length >= 15 && length >= data.lengthM * 0.35 ? { from: Math.max(0, best.from), to: Math.min(data.lengthM, best.to) } : null
}

/** A common name mid-sentence, in lower case (« le châtaignier »); a Latin name keeps its capital. */
export function midSentence(plant: Pick<SectionPlant, 'name' | 'latinName' | 'code'>): string {
  const name = plant.name ?? plant.code ?? ''
  return name && name !== plant.latinName ? name.charAt(0).toLowerCase() + name.slice(1) : name
}
