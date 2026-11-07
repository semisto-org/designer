import { STRATA, type Strata } from '../../types/plants.ts'

/**
 * One colour per strata, used everywhere a plant shows its strata (crowns
 * and points on the map, the legend, lists, the dossier, the sketches).
 * Hues come from the Semisto palette (leaf, framboise, mangue, humus) and
 * stay far apart, so a plan reads at a glance on an aerial photo as on a
 * light background: dark and light green for the two tree strata, then
 * warm and cool hues for the lower ones.
 */
export const STRATA_COLORS: Record<Strata, string> = {
  canopy: '#4d5500',
  sub_canopy: '#afbd00',
  shrub: '#c8305e',
  herbaceous: '#ef9b0d',
  ground_cover: '#1f8f7a',
  vine: '#7a3e9d',
  root: '#a05f00',
  aquatic: '#2b7bb9',
}

/**
 * The same strata as washes of watercolour, for the « rendu présentation »
 * (map/presentation/render): a designer's plan paints its trees in greens
 * from deep to light, so the eye reads the layers of the forest garden from
 * the canopy down, and keeps warm hues for what grows low.
 */
export const PLAN_STRATA_COLORS: Record<Strata, string> = {
  canopy: '#35593f',
  sub_canopy: '#7a9a3c',
  shrub: '#c3c96a',
  herbaceous: '#e0b85a',
  ground_cover: '#8fb08a',
  vine: '#8c6d99',
  root: '#b48a58',
  aquatic: '#6fa1c2',
}

/** The other washes of the « rendu présentation », shared by the map and its legend. */
export const PLAN_COLORS = {
  existingCrown: '#9a9784',
  existingEdge: '#6d6a5c',
  shadow: '#3a3a20',
  water: '#7fa9b8',
  waterEdge: '#3f6f86',
  pathFill: '#ead7a6',
  pathEdge: '#9c7b4c',
  terrace: '#e4cf9c',
  paper: '#f3ead6',
  ink: '#4a4136',
  trunk: '#4a3b2a',
} as const

/** A colour darkened by `amount` (0 to 1), for the rim of a painted crown. */
export function darken(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount))
  return '#' + [16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')
}

/**
 * Climbers grow up a tree, a wall or a trellis, not out over the ground: a
 * crown at their adult spread would cover what is under them. They show as
 * their point only (and, in 3D, on their support).
 */
export function drawsCrown(strata: Strata | null | undefined): boolean {
  return strata !== 'vine'
}

export type StrataCount = { strata: Strata; count: number }

/** The strata found among plants, from the highest down, with how many plants each. */
export function strataCounts(strata: Iterable<Strata>): StrataCount[] {
  const counts = new Map<Strata, number>()
  for (const s of strata) counts.set(s, (counts.get(s) ?? 0) + 1)
  return STRATA.filter((s) => counts.has(s)).map((s) => ({ strata: s, count: counts.get(s)! }))
}

/** Ink for a number written on a strata colour: white on dark hues, ink on light ones. */
export function inkOn(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#1b1712' : '#ffffff'
}

/**
 * Crowns are drawn by strata, the canopy first and the ground cover last,
 * then the wider crown under the narrower one: a fruit tree's crown, seen
 * from above, would hide the currants and the herbs planted under it, so
 * on the plan it is the wash they are drawn over.
 */
export function crownOrder(strata: Strata, radiusM: number): number {
  return STRATA.indexOf(strata) * 100 - Math.min(radiusM, 99)
}
