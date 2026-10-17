import type { Provenance } from '@/types/plants'

/** Harvest log of the fruit plants (PlantHarvest, HarvestLog). */
export const HARVEST_STAGES = ['on_tree', 'picked'] as const
export const HARVEST_AMOUNTS = ['none', 'light', 'normal', 'heavy'] as const
export const HARVEST_USES = ['juice', 'cooking', 'fresh', 'storage', 'other'] as const

export type HarvestStage = (typeof HARVEST_STAGES)[number]
export type HarvestAmount = (typeof HARVEST_AMOUNTS)[number]
export type HarvestUse = (typeof HARVEST_USES)[number]
export type SeasonStatus = 'picked' | 'bore' | 'none'

export type PlantHarvest = {
  id: number
  featureId: number
  notedOn: string
  season: number
  stage: HarvestStage
  amount: HarvestAmount | null
  quantityKg: number | null
  uses: HarvestUse[]
  note: string | null
  author: string | null
  createdAt: string | null
}

export type SeasonSummary = { status: SeasonStatus; amount: HarvestAmount | null; uses: HarvestUse[]; quantityKg: number | null }

export type HarvestPlantRow = {
  featureId: number
  name: string | null
  number: number | null
  speciesId: number | null
  speciesName: string | null
  varietyId: number | null
  varietyName: string | null
  plantedOn: string | null
  bearingFrom: number | null
  seasons: Record<string, SeasonSummary>
  lastBore: number | null
  lastNotedOn: string | null
  quietSeasons: number
  watch: boolean
}

/** GET /maps/:id/harvests */
export type HarvestLogData = {
  season: number
  seasons: number[]
  followedSeasons: number[]
  watchSeasons: number
  totals: {
    plants: number; picked: number; bore: number; none: number; unnoted: number
    quantityKg: number | null; uses: Partial<Record<HarvestUse, number>>; watch: number
  }
  plants: HarvestPlantRow[]
  varieties: HarvestVariety[]
}

type Keeping = 'keeps' | 'weeks' | 'short' | null

/** A variety's uses and season (PlantVariety#uses_json). */
export type VarietyUsesData = {
  id: number
  name: string
  uses: VarietyUse[]
  keeping: Keeping
  pickingMonth: number | null
  eatingFromMonth: number | null
  eatingUntilMonth: number | null
  provenance: Record<string, Provenance>
}

/** « Que faire de chaque variété ? » in the panel. */
export type HarvestVariety = VarietyUsesData & {
  speciesName: string | null
  plants: number
  here: Partial<Record<HarvestUse, number>>
}

export const VARIETY_USES = ['fresh', 'cooking', 'juice', 'cider', 'drying'] as const
export type VarietyUse = (typeof VARIETY_USES)[number]

/** « Que faire de cette récolte ? » (HarvestAdvice). */
export type HarvestAdviceData = {
  variety: VarietyUsesData | null
  keeping: Keeping
  ripensInStore: boolean
  here: {
    picked: number
    uses: Partial<Record<HarvestUse, number>>
    notes: { featureId: number; plant: string | null; notedOn: string; note: string }[]
  }
}

/** GET /maps/:id/features/:id/plant_harvests */
export type PlantHarvestsData = {
  harvests: PlantHarvest[]
  seasons: number[]
  followedSeasons: number[]
  watchSeasons: number
  plant: HarvestPlantRow | null
  advice: HarvestAdviceData
}

export type HarvestInput = {
  notedOn: string
  stage: HarvestStage
  amount: HarvestAmount | null
  uses: HarvestUse[]
  quantityKg: string
  note: string
}
