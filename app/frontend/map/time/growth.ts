// A plant's size on the 2D map at a moment of the time strip, with the
// growth model of the 3D view (relief/growth.ts), never a second one; and
// the shadow its crown casts at noon in June or December. Pure functions,
// tested in test/frontend/time.

import { graftTrunk, plantForm, plantShape, sizeAt, type Graft, type PlantStrata, type PlantTraining } from '../../relief/growth.ts'

/** What the server says of a species or cultivar's growth on this map (PlantingState#growth). */
export type GrowthEntry = { heightM: number; spreadM: number; maturityYears: number; indicative: boolean }

/** A plant as the 2D map grows it. */
export type GrowingPlant = {
  strata: PlantStrata
  plantType: string | null
  growth: GrowthEntry
  training: PlantTraining
  graft: Graft | null
  /** A support plant removed this many years after its planting, or null. */
  supportUntil: number | null
}

/** The key PlantingState#growth uses for a species and its cultivar. */
export const growthKey = (speciesId: number | null, varietyId: number | null) => `${speciesId ?? ''}:${varietyId ?? ''}`

/**
 * Height and spread (m) at `age` years after planting, or null when it is
 * not there (a support plant that gave way). 'adult' is the size it is kept
 * at once grown, whatever its support years.
 */
export function plantSizeAt(plant: GrowingPlant, age: number | 'adult'): { height: number; spread: number } | null {
  const model = {
    strata: plant.strata,
    heightM: plant.growth.heightM,
    spreadM: plant.growth.spreadM,
    maturityYears: plant.growth.maturityYears,
    training: plant.training,
    graft: plant.training === 'free' ? plant.graft : null,
    until: age === 'adult' ? null : plant.supportUntil,
  }
  return sizeAt(model, age === 'adult' ? 1000 : age)
}

export type Season = 'june' | 'december'
export const SEASONS: readonly Season[] = ['june', 'december']

/** The sun's declination at the solstices (degrees). */
const DECLINATION: Record<Season, number> = { june: 23.44, december: -23.44 }

/** Height of the sun above the horizon at solar noon on the solstice (degrees). */
export function noonElevation(lat: number, season: Season): number {
  return 90 - Math.abs(lat - DECLINATION[season])
}

/** Crowns lower than this leave the ground in the light, as in the 3D shade (relief/growth.ts). */
const SHADING_CROWN = 0.8

const M_PER_DEG_LAT = 111_320

/**
 * The shadow a plant's crown casts on flat ground at solar noon on the
 * solstice, as a closed ring of [lng, lat]: the exact projection of the
 * crown's ellipsoid (the same volume as the 3D view) along the sun's rays,
 * an ellipse as wide as the crown, stretched away from the sun. Null for a
 * low plant, a climber, or a sun under the horizon.
 */
export function crownShadow(
  [lng, lat]: [number, number], plant: Pick<GrowingPlant, 'strata' | 'plantType' | 'training' | 'graft'>,
  size: { height: number; spread: number }, season: Season, steps = 36,
): [number, number][] | null {
  const form = plantForm(plant.strata, plant.plantType)
  const shape = plantShape(form, plant.strata, size.height, size.spread, plant.training, graftTrunk({ training: plant.training, graft: plant.graft }))
  if (shape.kind !== 'crown' || shape.centre + shape.half < SHADING_CROWN || shape.radius <= 0) return null
  const elevation = noonElevation(lat, season)
  if (elevation <= 1) return null
  const k = 1 / Math.tan((elevation * Math.PI) / 180)
  // At noon the sun is due south of the place (north of it under the tropics): the shadow falls the other way.
  const away = lat >= DECLINATION[season] ? 1 : -1
  const along = Math.hypot(shape.radius, k * shape.half)
  const offset = k * shape.centre
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  const ring: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps
    const east = shape.radius * Math.cos(a)
    const north = away * (offset + along * Math.sin(a))
    ring.push([lng + east / mPerDegLng, lat + north / M_PER_DEG_LAT])
  }
  ring.push(ring[0])
  return ring
}
