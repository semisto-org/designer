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
/** The old mown path, there before the garden: from the house down to the hollow. */
export const PATH: Point[] = [[250, 232], [290, 300], [360, 360], [460, 410], [560, 440], [660, 470]]
/**
 * The small wood-chip paths laid at planting: a walk from the house past the
 * vegetable beds, round the pond and back along the south, with a cut through
 * the pear trees. The garden steps down to each of them like a woodland edge.
 */
export const TRAILS: Point[][] = [
  [[262, 236], [330, 246], [400, 236], [470, 236], [545, 244], [615, 276], [690, 302], [770, 324], [835, 352], [858, 400], [832, 452], [796, 492], [770, 540]],
  [[770, 540], [700, 556], [610, 562], [510, 578], [410, 580], [320, 560], [250, 515], [212, 440], [214, 360], [236, 290], [262, 236]],
  [[615, 276], [636, 330], [630, 390], [600, 438]],
]
export const STREAM: Point[] = [[560, 300], [600, 350], [640, 400], [680, 440]]
export const RUNOFF: Point[][] = [
  [[260, 140], [330, 250], [470, 330], [600, 400], [690, 450]],
  [[800, 180], [790, 300], [760, 400], [735, 445]],
  [[420, 600], [540, 560], [660, 510]],
]

export type Kind = 'canopy' | 'fruit' | 'shrub' | 'hedge' | 'herb'
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
  sureau: { R: 2, k: 3, h: 4, fruit: 3, kind: 'shrub', tone: 'prune' },
  argousier: { R: 1.7, k: 3, h: 3, fruit: 4, kind: 'shrub', tone: 'humus' },
  cassis: { R: 0.9, k: 2, h: 1.4, fruit: 2, kind: 'shrub', tone: 'prune' },
  groseillier: { R: 0.9, k: 2, h: 1.3, fruit: 2, kind: 'shrub', tone: 'clay' },
  groseillier_maq: { R: 0.9, k: 2, h: 1.2, fruit: 2, kind: 'shrub', tone: 'humus' },
  framboisier: { R: 1, k: 1.5, h: 1.6, fruit: 1, kind: 'shrub', tone: 'clay' },
  rosier: { R: 1.1, k: 2, h: 1.5, fruit: 2, kind: 'shrub', tone: 'clay' },
  aubepine: { R: 1.6, k: 2.2, h: 4, fruit: 3, kind: 'hedge', tone: 'clay' },
  prunellier: { R: 1.5, k: 2.2, h: 3, fruit: 3, kind: 'hedge', tone: 'prune' },
  erable: { R: 1.7, k: 2.5, h: 5, fruit: 99, kind: 'hedge', tone: null },
  cornouiller: { R: 1.5, k: 2, h: 3, fruit: 99, kind: 'hedge', tone: null },
  houx: { R: 1.3, k: 3, h: 3, fruit: 99, kind: 'hedge', tone: null },
  eglantier: { R: 1.5, k: 2, h: 2.5, fruit: 99, kind: 'hedge', tone: null },
  consoude: { R: 1.2, k: 0.6, h: 0.9, fruit: 99, kind: 'herb', tone: null },
  rhubarbe: { R: 1.3, k: 0.8, h: 0.8, fruit: 99, kind: 'herb', tone: null },
  fraisier: { R: 1.2, k: 0.6, h: 0.2, fruit: 99, kind: 'herb', tone: null },
  melisse: { R: 1.1, k: 0.5, h: 0.6, fruit: 99, kind: 'herb', tone: null },
  ciboulette: { R: 0.8, k: 0.5, h: 0.4, fruit: 99, kind: 'herb', tone: null },
  bugle: { R: 1.3, k: 0.7, h: 0.15, fruit: 99, kind: 'herb', tone: null },
} as const satisfies Record<string, { R: number; k: number; h: number; fruit: number; kind: Kind; tone: FruitTone }>

export type SpeciesKey = keyof typeof SPECIES

/** A plant on the terrain; `delay` is how long after planting it shows up (ground covers spread over the first years). */
export type Tree = { sp: SpeciesKey; x: number; y: number; seed: number; delay?: number }

/**
 * The trees, placed by hand: the tall ones (chestnut, alders) on the north
 * side where they shade nothing, fruit trees down the middle between the
 * paths. The walnut stands where a beginner would put it, just south of the
 * vegetable beds: its shade is the lesson of year 15.
 */
export const TREES: Tree[] = ([
  ['noyer', 450, 300], ['chataignier', 750, 200],
  ['aulne', 170, 150], ['aulne', 165, 255], ['aulne', 160, 345], ['aulne', 330, 115], ['aulne', 590, 118],
  ['pommier', 330, 470], ['pommier', 425, 505], ['pommier', 515, 492], ['pommier', 600, 520],
  ['poirier', 590, 350], ['poirier', 680, 372], ['cerisier', 840, 285],
  ['noisetier', 635, 226], ['noisetier', 270, 405],
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

/** Distance from a point to a polyline. */
export function distToLine(x: number, y: number, line: Point[]) {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    const dx = bx - ax
    const dy = by - ay
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return best
}

/** Distance to the nearest path, old or new. */
export function distToPaths(x: number, y: number) {
  return Math.min(distToLine(x, y, PATH), ...TRAILS.map((t) => distToLine(x, y, t)))
}

/** Distance to the terrain's edge (positive inside). */
export function distToEdge(x: number, y: number) {
  return distToLine(x, y, [...PARCEL, PARCEL[0]])
}

const inRect = (x: number, y: number, [rx, ry, rw, rh]: [number, number, number, number], pad: number) =>
  x > rx - pad && x < rx + rw + pad && y > ry - pad && y < ry + rh + pad
const HOUSE_RECT: [number, number, number, number] = [HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h]
const adultPx = (sp: SpeciesKey) => SPECIES[sp].R * PX_PER_M

/** Picks a key from weights, with a draw in [0, 1). */
function pick<K extends string>(weights: Partial<Record<K, number>>, u: number): K {
  const entries = Object.entries(weights) as [K, number][]
  let total = entries.reduce((a, [, w]) => a + w, 0) * u
  for (const [k, w] of entries) if ((total -= w) < 0) return k
  return entries[entries.length - 1][0]
}

/** A mixed field hedge all round the terrain, planted on day one. */
export const HEDGE: Tree[] = (() => {
  const r = rng(314)
  const out: Tree[] = []
  const inset = 13
  PARCEL.forEach(([ax, ay], i) => {
    const [bx, by] = PARCEL[(i + 1) % PARCEL.length]
    const len = Math.hypot(bx - ax, by - ay)
    // the polygon runs clockwise on screen, so the inside is to the right of each edge
    const nx = -(by - ay) / len
    const ny = (bx - ax) / len
    for (let d = 10; d < len - 10; d += 19 + r() * 4) {
      const x = ax + ((bx - ax) * d) / len + nx * (inset + (r() - 0.5) * 6)
      const y = ay + ((by - ay) * d) / len + ny * (inset + (r() - 0.5) * 6)
      if (!insidePolygon(x, y, PARCEL) || out.some((h) => Math.hypot(h.x - x, h.y - y) < 15)) continue
      const sp = pick<SpeciesKey>({ aubepine: 4, prunellier: 3, cornouiller: 2, erable: 1.5, houx: 1, eglantier: 1.5 }, r())
      out.push({ sp, x, y, seed: 5000 + out.length * 13 })
    }
  })
  return out
})()

/**
 * The understorey, scattered once with a fixed seed: shrubs where the garden
 * is far from the paths (the tallest furthest away, like a woodland edge
 * stepping down), and herbaceous ground covers filling everything else, which
 * spread over the first two or three years.
 */
export const UNDERSTOREY: Tree[] = (() => {
  const r = rng(2026)
  const shrubs: Tree[] = []
  const clear = (x: number, y: number, pad: number) =>
    insidePolygon(x, y, PARCEL) &&
    Math.hypot(x - POND.x, y - POND.y) > POND.r + pad &&
    !inRect(x, y, HOUSE_RECT, pad) &&
    !BEDS.some((b) => inRect(x, y, b, pad * 0.6))

  // the tall shrubs first, deep in each band; then the berry bushes down to the paths
  for (let n = 0; n < 12000; n++) {
    const tall = n < 4000
    const x = 110 + r() * 820
    const y = 60 + r() * 580
    const d = distToPaths(x, y)
    if (d < (tall ? 50 : 24) || distToEdge(x, y) < 34 || !clear(x, y, 22)) continue
    const sp = tall
      ? pick<SpeciesKey>({ sureau: 3, argousier: 2, noisetier: 2 }, r())
      : pick<SpeciesKey>({ cassis: 3, groseillier: 3, groseillier_maq: 2, framboisier: 3, rosier: 1.5 }, r())
    const R = adultPx(sp)
    if (TREES.some((t) => Math.hypot(t.x - x, t.y - y) < adultPx(t.sp) * (t.sp === 'noisetier' ? 1 : 0.5) + R * 0.5)) continue
    if (shrubs.some((s) => Math.hypot(s.x - x, s.y - y) < (adultPx(s.sp) + R) * 1.05)) continue
    shrubs.push({ sp, x, y, seed: 7000 + shrubs.length * 17 })
  }
  // one shrub in four goes back to ground cover: the garden stays dense but walkable
  shrubs.splice(0, shrubs.length, ...shrubs.filter((_, i) => i % 4 !== 3))

  const herbs: Tree[] = []
  const step = 21
  for (let gy = 70; gy < 640; gy += step) {
    for (let gx = 105; gx < 930; gx += step) {
      const x = gx + (r() - 0.5) * step * 0.8
      const y = gy + (r() - 0.5) * step * 0.8
      const d = Math.min(distToLine(x, y, PATH) - 2, ...TRAILS.map((t) => distToLine(x, y, t)))
      if (d < 10 || distToEdge(x, y) < 24 || !clear(x, y, 10)) continue
      if (shrubs.some((s) => Math.hypot(s.x - x, s.y - y) < adultPx(s.sp) * 0.75)) continue
      if (TREES.some((t) => Math.hypot(t.x - x, t.y - y) < 9)) continue
      const near = (sp: SpeciesKey[], k: number) => TREES.some((t) => sp.includes(t.sp) && Math.hypot(t.x - x, t.y - y) < adultPx(t.sp) * k)
      const weights: Partial<Record<SpeciesKey, number>> =
        BEDS.some((b) => inRect(x, y, b, 34)) ? { rhubarbe: 3, ciboulette: 2, consoude: 1 }
        : Math.hypot(x - POND.x, y - POND.y) < POND.r + 46 ? { melisse: 3, consoude: 1, bugle: 1 }
        : near(['pommier', 'poirier', 'cerisier'], 1) ? { consoude: 3, ciboulette: 2, melisse: 1, fraisier: 1 }
        : near(['noyer', 'chataignier', 'aulne'], 0.8) ? { bugle: 3, fraisier: 1, melisse: 1 }
        : d < 20 ? { fraisier: 3, bugle: 2, melisse: 1, ciboulette: 1 }
        : { consoude: 1, fraisier: 2, melisse: 2, bugle: 2, ciboulette: 1, rhubarbe: 0.5 }
      const sp = pick(weights, r())
      herbs.push({ sp, x, y, seed: 8000 + herbs.length * 11, delay: 0.25 + r() * r() * 1.6 })
    }
  }
  return [...herbs, ...shrubs]
})()

// ---------- life passing by

export const BIRDS = ['hirondelle', 'merle', 'pigeon', 'buse', 'geai', 'chardonneret'] as const
export type BirdKey = (typeof BIRDS)[number]
/** Wingspan drawn on the plan (world px: they fly above the garden, closer to the eye, so larger than life), and whether the bird glides. */
export const BIRD_SIZE: Record<BirdKey, { span: number; glide: boolean }> = {
  hirondelle: { span: 52, glide: false },
  merle: { span: 50, glide: false },
  pigeon: { span: 64, glide: false },
  buse: { span: 104, glide: true },
  geai: { span: 58, glide: false },
  chardonneret: { span: 42, glide: false },
}

/** A deterministic draw in [0, 1) from integers, so a flight is the same on every frame. */
function hash(...n: number[]) {
  let h = 2166136261
  for (const v of n) h = Math.imul(h ^ (v | 0), 16777619)
  return rng(h)()
}

/** How many birds may be about: one over the bare meadow, more as the garden grows, never a crowd. */
export const birdLanes = (age: number) => (age < 4 ? 1 : age < 12 ? 2 : 3)

export type Bird = { kind: BirdKey; x: number; y: number; heading: number; time: number }

/**
 * Birds crossing the terrain now and then, `time` in seconds of wall clock
 * (they pass whatever the scroll does), `age` the garden's age. Each lane
 * sends a bird across about two times out of three, then rests.
 */
export function birdsAt(time: number, age: number): Bird[] {
  const out: Bird[] = []
  const kinds: readonly BirdKey[] = age < 0 ? ['pigeon', 'buse', 'merle'] : age < 5 ? ['pigeon', 'buse', 'merle', 'hirondelle'] : BIRDS
  for (let lane = 0; lane < birdLanes(age); lane++) {
    const period = 21 + lane * 5
    const local = time + lane * 7.3
    const slot = Math.floor(local / period)
    if (hash(lane, slot, 1) > 0.68) continue
    const kind = kinds[Math.floor(hash(lane, slot, 2) * kinds.length)]
    const speed = kind === 'buse' ? 120 : 190
    const length = 2200
    const span = length / speed
    const start = hash(lane, slot, 3) * Math.max(0, period - span)
    const u = (local - slot * period - start) / span
    if (u < 0 || u > 1) continue
    const angle = hash(lane, slot, 4) * Math.PI * 2
    const side = (hash(lane, slot, 5) - 0.5) * 420
    const bend = (hash(lane, slot, 6) - 0.5) * 160
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const along = (u - 0.5) * length
    const off = side + Math.sin(u * Math.PI) * bend
    const x = WORLD_W / 2 + dx * along - dy * off
    const y = WORLD_H / 2 + dy * along + dx * off
    const turn = Math.cos(u * Math.PI) * Math.PI * bend / length
    out.push({ kind, x, y, heading: angle - turn, time: local })
  }
  return out
}

export type Fish = { kind: 'gardon' | 'poisson_rouge'; x: number; y: number; heading: number; alpha: number }

/** Now and then a fish glides under the pond's surface, once the pond has had a few years to fill with life. */
export function fishAt(time: number, age: number): Fish[] {
  if (age < 3) return []
  const out: Fish[] = []
  for (let lane = 0; lane < (age < 10 ? 1 : 2); lane++) {
    const period = 15 + lane * 6
    const local = time + lane * 9.1
    const slot = Math.floor(local / period)
    if (hash(lane, slot, 11) > 0.6) continue
    const span = 9
    const start = hash(lane, slot, 12) * (period - span)
    const u = (local - slot * period - start) / span
    if (u < 0 || u > 1) continue
    const a0 = hash(lane, slot, 13) * Math.PI * 2
    const a1 = a0 + Math.PI + (hash(lane, slot, 14) - 0.5) * 1.6
    const rr = POND.r * 0.55
    const e = smooth(0, 1, u)
    const x0 = POND.x + Math.cos(a0) * rr
    const y0 = POND.y + Math.sin(a0) * rr * 0.8
    const x1 = POND.x + Math.cos(a1) * rr
    const y1 = POND.y + Math.sin(a1) * rr * 0.8
    const wiggle = Math.sin(local * 2.2) * 4
    const heading = Math.atan2(y1 - y0, x1 - x0)
    out.push({
      kind: hash(lane, slot, 15) < 0.6 ? 'gardon' : 'poisson_rouge',
      x: lerp(x0, x1, e) - Math.sin(heading) * wiggle,
      y: lerp(y0, y1, e) + Math.cos(heading) * wiggle,
      heading: heading + Math.cos(local * 2.2) * 0.12,
      alpha: bump(0, 0.18, 0.8, 1, u),
    })
  }
  return out
}
