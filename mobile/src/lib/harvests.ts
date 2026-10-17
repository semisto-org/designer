// Harvest log on the terrain: which plants it applies to, the line sent to
// the server, and the next tree of a round in the orchard. Pure logic, so
// it is unit-tested.
import { anchor, distance } from './geo'
import type { MapBundle, MapFeature, Planting } from './types'

export const HARVEST_STAGES = ['on_tree', 'picked'] as const
export const HARVEST_AMOUNTS = ['none', 'light', 'normal', 'heavy'] as const
export const HARVEST_USES = ['juice', 'cooking', 'fresh', 'storage', 'other'] as const
export type HarvestStage = (typeof HARVEST_STAGES)[number]
export type HarvestAmount = (typeof HARVEST_AMOUNTS)[number]
export type HarvestUse = (typeof HARVEST_USES)[number]

export type NewHarvest = {
  notedOn: string
  stage: HarvestStage
  amount: HarvestAmount | null
  uses: HarvestUse[]
  quantityKg: number | null
  note: string | null
}

// Same strata as the server's HarvestLog::WOODY_STRATA (trees, shrubs, climbers).
const WOODY = new Set(['canopy', 'sub_canopy', 'shrub', 'vine'])

/** A tree, shrub or climber: the plants a harvest is noted on. */
export function isHarvestable(feature: MapFeature, planting: Planting | undefined): boolean {
  if (feature.properties.kind !== 'plant') return false
  const strata = planting?.species[String(feature.properties.species_id)]?.strata
  return strata ? WOODY.has(strata) : false
}

/** Amounts that make sense for a stage: a harvest is never « no fruit ». */
export function amountsFor(stage: HarvestStage): HarvestAmount[] {
  return HARVEST_AMOUNTS.filter((a) => stage === 'on_tree' || a !== 'none')
}

export function harvestBody(h: NewHarvest) {
  const picked = h.stage === 'picked'
  return {
    plant_harvest: {
      noted_on: h.notedOn, stage: h.stage, amount: h.amount, note: h.note,
      uses: picked ? h.uses : [], quantity_kg: picked ? h.quantityKg : null,
    },
  }
}

/**
 * The next tree of the round: the closest harvestable plant to `from`
 * that is not in `noted` (noted this season, sent or waiting).
 */
export function nextTree(bundle: MapBundle, from: MapFeature, noted: Set<number>): { feature: MapFeature; meters: number } | null {
  const origin = anchor(from.geometry)
  let best: { feature: MapFeature; meters: number } | null = null
  for (const feature of bundle.features) {
    if (feature.id === from.id || noted.has(feature.id) || !isHarvestable(feature, bundle.planting)) continue
    const meters = distance(origin, anchor(feature.geometry))
    if (!best || meters < best.meters) best = { feature, meters }
  }
  return best
}
