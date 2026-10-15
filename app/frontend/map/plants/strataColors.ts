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

export type StrataCount = { strata: Strata; count: number }

/** The strata found among plants, from the highest down, with how many plants each. */
export function strataCounts(strata: Iterable<Strata>): StrataCount[] {
  const counts = new Map<Strata, number>()
  for (const s of strata) counts.set(s, (counts.get(s) ?? 0) + 1)
  return STRATA.filter((s) => counts.has(s)).map((s) => ({ strata: s, count: counts.get(s)! }))
}
