import type { MapFeature } from '@/types'

// Keys MapFeature#as_geojson merges into properties: not part of the
// feature's own `properties` hash, never sent back on update.
const RESERVED = new Set([
  'id', 'layer', 'kind', 'name', 'notes', 'status', 'source', 'rationale', 'style', 'lockVersion', 'updatedAt',
])

/** The feature's own properties (the server replaces the whole hash on update). */
export function ownProperties(feature: MapFeature): Record<string, unknown> {
  return Object.fromEntries(Object.entries(feature.properties).filter(([key]) => !RESERVED.has(key)))
}

export function numberProperty(feature: MapFeature, key: string): number | null {
  const value = feature.properties[key]
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

export const isPlant = (f: MapFeature) => f.properties.layer === 'plants' && f.properties.kind === 'plant'
export const isPatch = (f: MapFeature) => f.properties.layer === 'plants' && f.properties.kind === 'patch'
