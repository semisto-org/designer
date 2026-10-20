// The published plants as a planting plan writes them: each plant point's
// number in a pastille of its strata colour, and the legend that lists the
// numbers species by species (« 3–5 Pommier »). A plant not in the ground
// yet at the year the visitor looks at is a hollow pastille. Pure
// functions: tested in test/frontend/public_maps.

import type { FeatureCollection, Point } from 'geojson'
import { numberRanges } from '../map/plants/labelRank.ts'
import { STRATA_COLORS, inkOn } from '../map/plants/strataColors.ts'
import { yearsBetween, type PlantStrata } from '../relief/growth.ts'
import type { PublicGrowth } from './garden.ts'

export type PlantNumberProps = {
  featureId: number
  /** Empty for a plant without a number: its pastille alone, in its strata colour. */
  number: string
  color: string
  ink: string
  /** In the ground at the year shown. */
  planted: boolean
}

/** A plant's number, read from the snapshot (a string in older plans: « 27 »). */
export function plantNumber(value: string | number | null | undefined): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Years after year 0 when a plant goes into the ground (negative: grown already). */
function startOf(growth: PublicGrowth, plant: PublicGrowth['plants'][number]): number {
  if (plant.plantedLongAgo) return -Infinity
  return Math.max(0, yearsBetween(growth.origin, plant.plantedOn ?? growth.today))
}

/** Every plant point as a pastille, at `year` years after year 0. */
export function plantNumbersAt(growth: PublicGrowth, year: number): FeatureCollection<Point, PlantNumberProps> {
  return {
    type: 'FeatureCollection',
    features: growth.plants.map((plant) => {
      const color = STRATA_COLORS[plant.strata] ?? STRATA_COLORS.shrub
      const number = plantNumber(plant.number)
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [plant.lng, plant.lat] },
        properties: { featureId: plant.id, number: number ? String(number) : '', color, ink: inkOn(color), planted: startOf(growth, plant) <= year + 1e-6 },
      }
    }),
  }
}

export type NumberedSpecies = { name: string; strata: PlantStrata; numbers: string; count: number }
export type StrataGroup = { strata: PlantStrata; count: number; species: NumberedSpecies[] }

const STRATA_ORDER: PlantStrata[] = ['canopy', 'sub_canopy', 'shrub', 'vine', 'herbaceous', 'ground_cover', 'root', 'aquatic']

/**
 * The legend of the published plants: strata from the highest down, each
 * with its species and their numbers (« 3, 5–7 »), plants without a number
 * counted only. Patches add their plants to the count of their strata.
 */
export function plantLegend(growth: PublicGrowth, unnamed: string): StrataGroup[] {
  const groups = new Map<PlantStrata, { count: number; species: Map<string, { numbers: number[]; count: number }> }>()
  const groupOf = (strata: PlantStrata) => {
    let group = groups.get(strata)
    if (!group) groups.set(strata, (group = { count: 0, species: new Map() }))
    return group
  }
  for (const plant of growth.plants) {
    const group = groupOf(plant.strata)
    group.count++
    const name = plant.name || unnamed
    const species = group.species.get(name) ?? { numbers: [], count: 0 }
    species.count++
    const number = plantNumber(plant.number)
    if (number) species.numbers.push(number)
    group.species.set(name, species)
  }
  for (const patch of growth.patches) {
    for (const line of patch.lines) {
      const group = groupOf(line.strata)
      group.count += line.quantity
      const name = line.name || unnamed
      const species = group.species.get(name) ?? { numbers: [], count: 0 }
      species.count += line.quantity
      group.species.set(name, species)
    }
  }
  return STRATA_ORDER.filter((s) => groups.has(s)).map((strata) => {
    const group = groups.get(strata)!
    const species = [...group.species.entries()]
      .map(([name, s]) => ({ name, strata, numbers: numberRanges(s.numbers), count: s.count, first: Math.min(...s.numbers, Infinity) }))
      .sort((a, b) => a.first - b.first || a.name.localeCompare(b.name, 'fr'))
      .map(({ first: _first, ...rest }) => rest)
    return { strata, count: group.count, species }
  })
}
