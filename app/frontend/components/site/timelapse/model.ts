// The home page's time-lapse: an example terrain whose forest garden grows over
// thirty years as the visitor scrolls. This file is the model (place, species,
// seasons, growth, chapters), with no DOM so it can be tested alone; draw.ts
// paints it and Timelapse.tsx drives it from the scroll.

/** World units: the terrain is drawn in a 1000 × 680 box, 1000 px = 80 m. */
export const PX_PER_M = 12.5
export const WORLD_W = 1000
export const WORLD_H = 680
export const BASE_YEAR = 2026
/** Planting day, as a time in years from 1 January 2026 (early November). */
export const PLANTED = 0.86

export type Point = [number, number]

export const PARCEL: Point[] = [[120, 110], [560, 70], [880, 140], [920, 420], [760, 600], [300, 630], [110, 470]]
export const HOUSE = { x: 205, y: 180, w: 74, h: 52 }
export const BEDS: [number, number, number, number][] = [[392, 148, 128, 18], [392, 174, 128, 18], [392, 200, 128, 18]]
export const POND = { x: 720, y: 470, r: 58 }
export const PATH: Point[] = [[250, 232], [290, 300], [360, 360], [460, 410], [560, 440], [660, 470]]
export const STREAM: Point[] = [[560, 300], [600, 350], [640, 400], [680, 440]]
export const RUNOFF: Point[][] = [
  [[260, 140], [330, 250], [470, 330], [600, 400], [690, 450]],
  [[800, 180], [790, 300], [760, 400], [735, 445]],
  [[420, 600], [540, 560], [660, 510]],
]

export type Kind = 'canopy' | 'fruit' | 'shrub'
export type FruitTone = 'humus' | 'clay' | 'prune' | null

/** Adult crown radius (m), growth time constant (years), adult height (m), first crop (years after planting). */
export const SPECIES = {
  noyer: { R: 9, k: 11, h: 20, fruit: 10, kind: 'canopy', tone: 'humus' },
  chataignier: { R: 8, k: 12, h: 18, fruit: 8, kind: 'canopy', tone: 'humus' },
  aulne: { R: 3.6, k: 5, h: 12, fruit: 99, kind: 'canopy', tone: null },
  pommier: { R: 3.5, k: 5, h: 5, fruit: 4, kind: 'fruit', tone: 'clay' },
  poirier: { R: 3, k: 6, h: 6, fruit: 5, kind: 'fruit', tone: 'humus' },
  cerisier: { R: 4, k: 6, h: 7, fruit: 5, kind: 'fruit', tone: 'clay' },
  noisetier: { R: 2.5, k: 4, h: 4, fruit: 4, kind: 'shrub', tone: 'humus' },
  cassis: { R: 0.9, k: 2, h: 1.4, fruit: 2, kind: 'shrub', tone: 'prune' },
} as const satisfies Record<string, { R: number; k: number; h: number; fruit: number; kind: Kind; tone: FruitTone }>

export type SpeciesKey = keyof typeof SPECIES

export type Tree = { sp: SpeciesKey; x: number; y: number; seed: number }

export const TREES: Tree[] = ([
  ['noyer', 450, 300], ['chataignier', 770, 255],
  ['aulne', 160, 255], ['aulne', 150, 340], ['aulne', 190, 155], ['aulne', 300, 95],
  ['pommier', 300, 430], ['pommier', 375, 480], ['pommier', 450, 525], ['pommier', 530, 480], ['pommier', 605, 545],
  ['poirier', 650, 360], ['poirier', 565, 385], ['cerisier', 830, 335],
  ['noisetier', 240, 525], ['noisetier', 190, 445], ['noisetier', 860, 235],
  ['cassis', 335, 478], ['cassis', 410, 505], ['cassis', 490, 548], ['cassis', 565, 520], ['cassis', 640, 505], ['cassis', 700, 410], ['cassis', 345, 420],
] as [SpeciesKey, number, number][]).map(([sp, x, y], i) => ({ sp, x, y, seed: 1000 + i * 97 }))

/** Trees a visitor can plant with a click, in turn. */
export const PLANTABLE: SpeciesKey[] = ['pommier', 'poirier', 'cerisier', 'noisetier']

// ---------- maths

/** A small seeded generator (mulberry32), so every watercolour wash keeps its shape. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
/** Rises from a to b, holds, falls from c to d. */
export const bump = (a: number, b: number, c: number, d: number, x: number) => smooth(a, b, x) * (1 - smooth(c, d, x))

// ---------- growth

/** Crown radius in world px, `age` years after planting (0 before). */
export function crownPx(sp: SpeciesKey, age: number) {
  if (age < 0) return 0
  return Math.max(0.35, SPECIES[sp].R * (1 - Math.exp(-age / SPECIES[sp].k))) * PX_PER_M
}
/** Height in metres, `age` years after planting. */
export function heightM(sp: SpeciesKey, age: number) {
  return Math.max(0.8, SPECIES[sp].h * (1 - Math.exp(-age / (SPECIES[sp].k * 1.1))))
}

// ---------- seasons

export type Season = {
  /** Fraction of the year, 0 = 1 January. */
  f: number
  leaf: number
  autumn: number
  blossom: number
  fruit: number
  snow: number
  /** Shadow length factor: long in winter, short in summer. */
  shadow: number
  /** Leaves falling. */
  fall: number
}

/** What the garden looks like at time `tau` (years from 1 January 2026), for a temperate Western European year. */
export function seasonAt(tau: number): Season {
  const f = ((tau % 1) + 1) % 1
  return {
    f,
    leaf: smooth(0.24, 0.4, f) * (1 - smooth(0.8, 0.93, f)),
    autumn: smooth(0.66, 0.8, f),
    blossom: bump(0.24, 0.29, 0.34, 0.4, f),
    fruit: bump(0.5, 0.58, 0.78, 0.86, f),
    snow: Math.max(1 - smooth(0.04, 0.13, f), smooth(0.94, 0.99, f)),
    shadow: 0.5 + (1.1 * (Math.cos(f * Math.PI * 2) + 1)) / 2,
    fall: bump(0.76, 0.82, 0.88, 0.93, f),
  }
}

/** Calendar of a time: year, month index (0–11), and the garden's age in whole years (0 before planting). */
export function calendar(tau: number) {
  const f = ((tau % 1) + 1) % 1
  const age = tau - PLANTED
  return {
    year: BASE_YEAR + Math.floor(tau),
    month: Math.min(11, Math.floor(f * 12)),
    gardenYear: age < 0.25 ? 0 : Math.max(1, Math.ceil(age)),
    stage: tau < 0.2 ? 'bare' : age < 0 ? 'observe' : age < 0.25 ? 'planting' : 'growing',
  } as const
}

// ---------- chapters: what the scroll position means

export type Chapter = {
  /** Time shown when the chapter is in place. */
  t: number
  /** Camera zoom (1 = the terrain fills the scene, below 1 the neighbours appear). */
  zoom: number
  observe?: boolean
  plan?: boolean
  plant?: boolean
}

/** One entry per chapter of `site.home.story.chapters`, in the same order. */
export const CHAPTERS: Chapter[] = [
  { t: 0, zoom: 1 },
  { t: 0.05, zoom: 1 },
  { t: 0.32, zoom: 1, observe: true },
  { t: PLANTED, zoom: 1, plan: true },
  { t: 1.31, zoom: 1 },
  { t: 5.62, zoom: 1 },
  { t: 15.78, zoom: 1 },
  { t: 30.04, zoom: 1 },
  { t: 30.47, zoom: 1, plant: true },
  { t: 30.5, zoom: 0.24 },
]

export type SceneState = { tau: number; zoom: number; observe: number; plan: number; plantMode: boolean; chapter: number }

/**
 * The scene for a reading position: `tops` are the chapters' top offsets in
 * the page, `y` the reading line. Each chapter holds still for its first
 * third, then time runs towards the next one.
 */
export function stateAt(tops: number[], y: number, viewport: number, chapters: Chapter[] = CHAPTERS): SceneState {
  let i = 0
  while (i < tops.length - 1 && y >= tops[i + 1]) i++
  const a = chapters[i]
  const b = chapters[Math.min(i + 1, chapters.length - 1)]
  const span = (tops[i + 1] ?? tops[i] + viewport) - tops[i]
  const u = clamp((y - tops[i]) / Math.max(1, span), 0, 1)
  const m = smooth(0.38, 1, u)
  const fade = smooth(0.3, 0.7, u)
  return {
    tau: lerp(a.t, b.t, m),
    zoom: lerp(a.zoom, b.zoom, m),
    observe: lerp(a.observe ? 1 : 0, b.observe ? 1 : 0, fade),
    plan: lerp(a.plan ? 1 : 0, b.plan ? 1 : 0, fade),
    plantMode: !!a.plant && u < 0.6,
    chapter: i,
  }
}

/** Share of the parcel covered by crowns at a given age, sampled on a grid (for tests and captions). */
export function canopyCover(age: number, step = 6) {
  let inside = 0
  let covered = 0
  for (let y = 0; y < WORLD_H; y += step) {
    for (let x = 0; x < WORLD_W; x += step) {
      if (!insidePolygon(x, y, PARCEL)) continue
      inside++
      if (TREES.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 <= crownPx(t.sp, age) ** 2)) covered++
    }
  }
  return inside ? covered / inside : 0
}

export function insidePolygon(x: number, y: number, poly: Point[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
