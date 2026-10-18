import { booleanWithin, rhumbBearing, rhumbDistance, transformTranslate } from '@turf/turf'
import type { Feature, Geometry, Polygon, Position } from 'geojson'

/**
 * Several elements moved together keep their spacing: each one travels the
 * same distance in metres, in the same direction, as the cursor did.
 */
export function translateGeometry(geometry: Geometry, from: Position, to: Position): Geometry {
  const distance = rhumbDistance(from, to, { units: 'meters' })
  if (distance === 0) return geometry
  const bearing = rhumbBearing(from, to)
  return transformTranslate(geometry, distance, bearing, { units: 'meters' })
}

/** True while a selection is being dragged: map clicks then neither select nor toggle. */
export const selectionMove = { active: false }

/** Ids after a Shift+click (or a tap in « Sélectionner plusieurs »): the element joins the selection, or leaves it. */
export function toggled(selection: number[], id: number, alreadySelected: number | null): number[] {
  const base = selection.length || alreadySelected == null ? selection : [alreadySelected]
  return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
}

/**
 * A Shift+drag box takes the elements shown under it (`hits`) that lie
 * entirely inside it: a wide zone the box only crosses stays out, so boxing
 * a few plants does not drag the bed they grow in along.
 */
export function idsWithin(features: Feature[], hits: { id: number | null }[], box: Polygon | Feature<Polygon>): number[] {
  const shown = new Set(hits.map((hit) => hit.id).filter((id): id is number => id != null))
  return features
    .filter((f) => shown.has(Number(f.properties?.id)) && booleanWithin(f.geometry, box))
    .map((f) => Number(f.properties?.id))
}
