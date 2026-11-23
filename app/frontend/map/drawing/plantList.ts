import type { Polygon, Position } from 'geojson'
import type { MapFeature } from '../../types/index.ts'
import type { PlantingState, Strata } from '../../types/plants.ts'
import { isPlannedPlant } from '../scenario.ts'

/**
 * The plants listed on the annex of the plan at scale: every plant whose
 * numbered dot the printed map shows (inside the frame, kept by « Calques »,
 * the variant, the étiquette and the time strip), by number. A plan that
 * says « 127 » sends the reader to this list to learn it is a Reine-claude.
 * Pure (no React, no MapLibre), tested in test/frontend/drawing.
 */
export type PlantListRow = {
  featureId: number
  number: number
  speciesId: number | null
  /** The name the person gave the plant, else its species' common name, else its latin name. */
  name: string
  variety: string | null
  latinName: string | null
  strata: Strata | null
  /** In the ground (with the year when known), or still to plant. */
  planted: boolean
  plantedYear: number | null
}

/** Whether a point lies inside a ring (ray casting; the frame is a small rectangle, so planar is exact enough). */
export function insideRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const positiveInt = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * `shown`: whether the printed map draws this plant (layers, strata, variant,
 * étiquette, moment, drafts left out); `strataOf`: the strata it plays on this
 * map (its palette line's, else its species').
 */
export function plantListRows(
  features: MapFeature[],
  data: PlantingState | null,
  frame: Polygon,
  shown: (feature: MapFeature) => boolean,
  strataOf: (feature: MapFeature) => Strata | null,
): PlantListRow[] {
  const ring = frame.coordinates[0]
  const rows: PlantListRow[] = []
  for (const feature of features) {
    const p = feature.properties
    if (p.layer !== 'plants' || p.kind !== 'plant' || feature.geometry.type !== 'Point') continue
    const number = positiveInt(p.number)
    if (number == null || !shown(feature) || !insideRing(feature.geometry.coordinates, ring)) continue
    const speciesId = positiveInt(p.species_id)
    const species = speciesId != null ? data?.species[String(speciesId)] : undefined
    const variety = species ? data?.varieties[String(positiveInt(p.variety_id))] : undefined
    const ownName = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null
    const planted = !isPlannedPlant(p)
    const year = planted && typeof p.planted_on === 'string' ? Number(p.planted_on.slice(0, 4)) : NaN
    rows.push({
      featureId: p.id,
      number,
      speciesId,
      name: ownName ?? species?.commonName ?? species?.latinName ?? '',
      variety: variety?.name ?? null,
      latinName: species?.latinName ?? null,
      strata: strataOf(feature),
      planted,
      plantedYear: Number.isFinite(year) && year > 1000 ? year : null,
    })
  }
  return rows.sort((a, b) => a.number - b.number || a.featureId - b.featureId)
}

/** How many species the list holds, for its heading. */
export function speciesCount(rows: PlantListRow[]): number {
  return new Set(rows.flatMap((r) => (r.speciesId != null ? [r.speciesId] : []))).size
}
