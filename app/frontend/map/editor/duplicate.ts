import { transformTranslate } from '@turf/turf'
import type { Geometry } from 'geojson'
import type { NewFeature } from '@/map/editor/EditorContext'
import type { MapFeature } from '@/types'

// What belongs to the original, not to a copy: the keys as_geojson merges
// into properties (sent apart or the server's own), a plant's number (the
// server gives the next one) and a past swap.
const NOT_COPIED = new Set([
  'id', 'layer', 'kind', 'name', 'notes', 'status', 'source', 'rationale', 'style', 'tags', 'lockVersion', 'updatedAt',
  'number', 'swapped',
])

/** How far a copied line or surface lands from the original, in metres. */
export const OFFSET_M = 4

/** The element to create for a copy of `feature` at `geometry`. */
export function duplicateInput(feature: MapFeature, geometry: Geometry): NewFeature {
  const p = feature.properties
  const properties = Object.fromEntries(Object.entries(p).filter(([key]) => !NOT_COPIED.has(key)))
  return {
    layer: p.layer,
    kind: p.kind,
    geometry,
    name: p.name,
    notes: p.notes,
    properties,
    style: p.style,
    tags: p.tags ?? [],
    status: 'active',
  }
}

/** A point is copied where the person clicks; anything else lands beside it. */
export function placesByClick(feature: MapFeature): boolean {
  return feature.geometry.type === 'Point'
}

/** The original's shape, moved south-east so that both stay visible. */
export function besideGeometry(geometry: Geometry, metres = OFFSET_M): Geometry {
  return transformTranslate(geometry, metres / 1000, 135, { units: 'kilometers' }) as Geometry
}
