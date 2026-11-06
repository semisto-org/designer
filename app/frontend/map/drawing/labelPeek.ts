import type { MapFeature } from '@/types'

/**
 * The name shown on hover when the names are hidden from the map: a plant's
 * label as the plants overlay writes it, else the element's own name.
 * Nothing for an element without a name: no empty pill.
 */
export function peekLabel(feature: Pick<MapFeature, 'properties'> | undefined, plantLabel: (id: number) => string | undefined): string | null {
  if (!feature) return null
  const { id, layer, kind, name } = feature.properties as { id: number; layer?: string; kind?: string; name?: unknown }
  if (layer === 'plants' && kind === 'plant') {
    const label = plantLabel(id)
    if (label) return label
  }
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/**
 * The name of a marker that is not a map element (a soil sampling point, a
 * bio-indicator plant, a weather station): its `label`, else its `name`.
 */
export function markerPeekLabel(properties: Record<string, unknown> | null | undefined): string | null {
  for (const value of [properties?.label, properties?.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
