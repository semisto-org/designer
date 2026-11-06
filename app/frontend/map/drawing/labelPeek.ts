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
