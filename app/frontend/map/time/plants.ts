import { graftProperty, numberProperty, TRAINABLE_STRATA, trainingProperty } from '@/map/plants/properties'
import { plantIsSupport } from '@/map/plants/strata'
import { growthKey, plantSizeAt, type GrowingPlant } from '@/map/time/growth'
import { plantAge, plantedLongAgo, type Moment, type Timeline } from '@/map/time/moment'
import type { MapFeature } from '@/types'
import type { PlantingState, Strata } from '@/types/plants'

/** A plant point as the time strip grows it, or null while its growth is unknown (no species, planting data not loaded). */
export function growingPlant(feature: MapFeature, data: PlantingState | null, strata: Strata | null): GrowingPlant | null {
  if (!data || !strata) return null
  const speciesId = numberProperty(feature, 'species_id')
  const growth = data.growth?.[growthKey(speciesId, numberProperty(feature, 'variety_id'))]
  if (!growth) return null
  const training = TRAINABLE_STRATA.includes(strata) ? trainingProperty(feature) : 'free'
  const support = plantIsSupport(feature, data) && !plantedLongAgo(feature.properties)
  return {
    strata,
    plantType: data.species[String(speciesId)]?.plantType ?? null,
    growth,
    training,
    graft: training === 'free' ? graftProperty(feature, strata) : null,
    supportUntil: support ? numberProperty(feature, 'support_until') : null,
  }
}

/**
 * A plant's height and spread at the moment shown: `undefined` when its
 * growth is unknown (the caller keeps the adult crown), null when it is
 * not there at that moment (not planted yet, or a support plant that gave way).
 */
export function sizeAtMoment(feature: MapFeature, plant: GrowingPlant | null, moment: Moment, timeline: Timeline) {
  if (!plant) return undefined
  const age = plantAge(feature.properties, moment, timeline)
  return age == null ? null : plantSizeAt(plant, age)
}
