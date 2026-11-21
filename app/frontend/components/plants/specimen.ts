// The « spécimen » page of a plant (its inspector on the website, its sheet
// on the phone): how many winters it has spent in the ground, and the little
// watercolour of its strata drawn beside its name, like a naturalist's plate.
// Plain TypeScript, no imports: the phone keeps a twin of this file
// (mobile/src/lib/specimen.ts), and a test there checks that they agree.

export type PlantedPrecision = 'year' | 'unknown' | null

/**
 * How many winters a plant has lived through in the ground: the mid-winters
 * (15 January) between its planting and today. A tree planted in November
 * 2024 has seen two by November 2026. A planting known only by its year
 * counts from the middle of that year; an unknown date gives null.
 */
export function wintersInGround(plantedOn: string, precision: PlantedPrecision, today: string): number | null {
  if (precision === 'unknown') return null
  const year = Number(plantedOn.slice(0, 4))
  if (!Number.isFinite(year)) return null
  const from = precision === 'year' ? `${year}-07-01` : plantedOn.slice(0, 10)
  const nowYear = Number(today.slice(0, 4))
  let count = 0
  for (let y = year; y <= nowYear; y += 1) {
    const mid = `${y}-01-15`
    if (mid > from && mid <= today) count += 1
  }
  return count
}

/** Whether `today` falls in the gardeners' winter (December to February). */
export function inWinter(today: string): boolean {
  const month = Number(today.slice(5, 7))
  return month === 12 || month <= 2
}

/** One wash of colour (a crown, a clump, a water line) or one pencil line. */
export type PlateMark = { d: string; kind: 'wash' | 'deep' | 'ink' }

/** The plates' washes: the strata's watercolours of the « rendu présentation » (PLAN_STRATA_COLORS). */
export const PLATE_COLORS: Record<string, string> = {
  canopy: '#35593f',
  sub_canopy: '#7a9a3c',
  shrub: '#c3c96a',
  herbaceous: '#e0b85a',
  ground_cover: '#8fb08a',
  vine: '#8c6d99',
  root: '#b48a58',
  aquatic: '#6fa1c2',
}

/** The pencil of the plates (PLAN_COLORS.ink). */
export const PLATE_INK = '#4a4136'

/** The plates' frame: 120 × 96, ground at y = 86. */
export const PLATE_VIEWBOX = '0 0 120 96'

/**
 * A soft, slightly irregular closed shape around (cx, cy): a wash of
 * watercolour never has a perfect edge. Deterministic, so a plate is the
 * same every time it is drawn.
 */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, points = 9): string {
  const pts: [number, number][] = []
  for (let i = 0; i < points; i += 1) {
    const a = (i / points) * Math.PI * 2
    const wobble = 1 + 0.09 * Math.sin(seed * 12.9898 + i * 78.233) + 0.05 * Math.cos(seed * 4.1 + i * 2.7)
    pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble])
  }
  // Through the midpoints, with each point as a control: a smooth closed curve.
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const start = mid(pts[points - 1], pts[0])
  let d = `M${r(start[0])} ${r(start[1])}`
  for (let i = 0; i < points; i += 1) {
    const p = pts[i]
    const m = mid(p, pts[(i + 1) % points])
    d += ` Q${r(p[0])} ${r(p[1])} ${r(m[0])} ${r(m[1])}`
  }
  return d + 'Z'
}

const r = (n: number) => Math.round(n * 10) / 10

/** A leaf from its base, pointing at `angle` degrees (0 = up), `length` long. */
function leaf(x: number, y: number, angle: number, length: number, width: number): string {
  const a = (angle * Math.PI) / 180
  const tip = [x + Math.sin(a) * length, y - Math.cos(a) * length]
  const nx = Math.cos(a) * width
  const ny = Math.sin(a) * width
  const mx = (x + tip[0]) / 2
  const my = (y + tip[1]) / 2
  return `M${r(x)} ${r(y)} Q${r(mx + nx)} ${r(my + ny)} ${r(tip[0])} ${r(tip[1])} Q${r(mx - nx)} ${r(my - ny)} ${r(x)} ${r(y)}Z`
}

const GROUND = 'M8 86 C30 85 46 87 64 86 S100 85 112 86'

/**
 * What each strata looks like on the plate: a tall tree, a low tree, a
 * clump of stems, upright leaves, a low mat, a climber on its stake, a
 * tuber under the soil line, reeds in water. Washes first, ink on top.
 */
export const STRATA_PLATES: Record<string, PlateMark[]> = {
  canopy: [
    { kind: 'wash', d: blob(60, 36, 34, 28, 1) },
    { kind: 'deep', d: blob(66, 44, 22, 17, 2) },
    { kind: 'ink', d: 'M60 86 C59 74 61 64 59 54 M59 64 C54 60 50 58 46 52 M60 60 C65 56 70 54 74 48' },
    { kind: 'ink', d: GROUND },
  ],
  sub_canopy: [
    { kind: 'wash', d: blob(60, 50, 24, 19, 3) },
    { kind: 'deep', d: blob(65, 55, 15, 11, 4) },
    { kind: 'ink', d: 'M60 86 C59 78 61 72 60 64 M60 70 C56 67 53 64 50 60 M60 68 C64 65 67 62 70 59' },
    { kind: 'ink', d: GROUND },
  ],
  shrub: [
    { kind: 'wash', d: blob(44, 68, 15, 13, 5) },
    { kind: 'wash', d: blob(62, 62, 17, 16, 6) },
    { kind: 'wash', d: blob(79, 69, 14, 12, 7) },
    { kind: 'deep', d: blob(62, 70, 14, 9, 8) },
    { kind: 'ink', d: 'M58 86 C56 80 52 76 46 72 M60 86 C61 78 62 72 62 64 M62 86 C66 80 72 76 78 72' },
    { kind: 'ink', d: GROUND },
  ],
  herbaceous: [
    { kind: 'wash', d: leaf(52, 86, -32, 34, 6) },
    { kind: 'wash', d: leaf(58, 86, -10, 44, 6) },
    { kind: 'wash', d: leaf(62, 86, 12, 40, 6) },
    { kind: 'wash', d: leaf(67, 86, 34, 32, 6) },
    { kind: 'deep', d: blob(60, 82, 14, 5, 9) },
    { kind: 'ink', d: 'M58 86 C58 70 57 56 56 44 M62 86 C63 72 66 60 70 50' },
    { kind: 'ink', d: GROUND },
  ],
  ground_cover: [
    { kind: 'wash', d: blob(60, 80, 44, 8, 10, 12) },
    { kind: 'deep', d: blob(46, 80, 14, 5, 11) },
    { kind: 'deep', d: blob(76, 81, 13, 4.5, 12) },
    { kind: 'ink', d: 'M20 84 C34 78 48 82 60 79 S86 77 100 83' },
    { kind: 'ink', d: GROUND },
  ],
  vine: [
    { kind: 'wash', d: leaf(60, 72, -60, 14, 5) },
    { kind: 'wash', d: leaf(60, 56, 60, 14, 5) },
    { kind: 'wash', d: leaf(60, 40, -60, 13, 5) },
    { kind: 'wash', d: leaf(60, 26, 55, 12, 4.5) },
    { kind: 'deep', d: blob(60, 82, 10, 4, 13) },
    { kind: 'ink', d: 'M60 86 L60 12' },
    { kind: 'ink', d: 'M60 84 C68 78 68 72 60 68 S52 58 60 52 S68 42 60 36 S52 26 60 20' },
    { kind: 'ink', d: GROUND },
  ],
  root: [
    { kind: 'wash', d: leaf(56, 58, -24, 26, 6) },
    { kind: 'wash', d: leaf(62, 58, 18, 28, 6) },
    { kind: 'deep', d: blob(59, 74, 11, 13, 14) },
    { kind: 'ink', d: 'M10 58 C30 57 46 59 64 58 S100 57 110 58' },
    { kind: 'ink', d: 'M59 87 C58 90 59 92 57 95 M62 86 C65 89 66 91 69 93' },
  ],
  aquatic: [
    { kind: 'wash', d: blob(60, 84, 50, 8, 15, 12) },
    { kind: 'wash', d: leaf(48, 80, -8, 46, 3.5) },
    { kind: 'wash', d: leaf(62, 80, 4, 56, 3.5) },
    { kind: 'wash', d: leaf(74, 80, 14, 42, 3.5) },
    { kind: 'deep', d: blob(62, 30, 3, 8, 16) },
    { kind: 'ink', d: 'M16 82 C30 80 40 84 54 82 S84 80 104 83' },
  ],
}
