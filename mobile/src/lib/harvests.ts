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

/** A tree, shrub or climber in the ground: the plants a harvest is noted on. */
export function isHarvestable(feature: MapFeature, planting: Planting | undefined): boolean {
  if (feature.properties.kind !== 'plant' || !feature.properties.planted_on) return false
  const strata = planting?.species[String(feature.properties.species_id)]?.strata
  return strata ? WOODY.has(strata) : false
}

/** Amounts that make sense for a stage: a harvest is never « no fruit ». */
export function amountsFor(stage: HarvestStage): HarvestAmount[] {
  return HARVEST_AMOUNTS.filter((a) => stage === 'on_tree' || a !== 'none')
}

/** « Aucun fruit »: came to pick, the tree carries nothing (a season without fruit). */
export function nothingHarvest(notedOn: string, note = ''): NewHarvest {
  return { notedOn, stage: 'on_tree', amount: 'none', uses: [], quantityKg: null, note: note.trim() || null }
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

export type VarietyUse = 'fresh' | 'cooking' | 'juice' | 'cider' | 'drying'

/** « Que faire de cette récolte ? », as the server sends it (HarvestAdvice). */
export type HarvestAdvice = {
  variety: {
    name: string
    uses: VarietyUse[]
    pickingMonth: number | null
    eatingFromMonth: number | null
    eatingUntilMonth: number | null
  } | null
  keeping: 'keeps' | 'weeks' | 'short' | null
  ripensInStore: boolean
  here: { picked: number; uses: Partial<Record<HarvestUse, number>>; notes: { plant: string | null; notedOn: string; note: string }[] }
}

type Translate = (key: string, vars?: Record<string, string | number>) => string

/** The advice as lines of text, in the order the web sheet shows them. */
export function adviceLines(advice: HarvestAdvice, t: Translate): string[] {
  const v = advice.variety
  const month = (m: number) => t(`plant_harvests.months.${m}`)
  if (!v) return [t('plant_harvests.advice.no_variety'), t('plant_harvests.advice.rule')]
  const lines: string[] = []
  if (v.uses.length > 0) lines.push(t('plant_harvests.advice.good_for', { uses: v.uses.map((u) => t(`plant_harvests.advice.variety_uses.${u}`)).join(', ') }))
  const season = [
    v.pickingMonth ? t('plant_harvests.advice.picking', { month: month(v.pickingMonth) }) : null,
    v.eatingUntilMonth
      ? v.eatingFromMonth
        ? t('plant_harvests.advice.eating', { from: month(v.eatingFromMonth), until: month(v.eatingUntilMonth) })
        : t('plant_harvests.advice.eating_until', { until: month(v.eatingUntilMonth) })
      : null,
  ].filter(Boolean).join(' · ')
  if (season) lines.push(season)
  lines.push(advice.keeping
    ? t(`plant_harvests.advice.keeping.${advice.keeping}`, { until: v.eatingUntilMonth ? month(v.eatingUntilMonth) : '' })
    : t('plant_harvests.advice.unknown'))
  if (advice.ripensInStore && v.pickingMonth && v.eatingFromMonth) {
    lines.push(t('plant_harvests.advice.ripens_in_store', { picking: month(v.pickingMonth), from: month(v.eatingFromMonth) }))
  }
  lines.push(t('plant_harvests.advice.rule'))
  const here = Object.entries(advice.here.uses).map(([use, count]) => t('plant_harvests.advice.here_use', { use: t(`plant_harvests.uses.${use}`).toLowerCase(), count: count ?? 0 }))
  lines.push(advice.here.picked === 0 ? t('plant_harvests.advice.here_none') : here.length > 0 ? t('plant_harvests.advice.here_uses', { uses: here.join(', ') }) : '')
  advice.here.notes.forEach((n) => lines.push(`« ${n.note} »${n.plant ? ` — ${n.plant}` : ''}`))
  return lines.filter(Boolean)
}
