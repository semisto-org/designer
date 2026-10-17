import { MANAGED_SIZE, type PlantTraining } from '@/relief/growth'
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

/** Strata whose plants can be pollarded or coppiced (trees and bushes). */
export const TRAINABLE_STRATA: readonly string[] = ['canopy', 'sub_canopy', 'shrub']

/** How a plant is kept, from its properties: free when absent or unknown. */
export function trainingProperty(feature: MapFeature): PlantTraining {
  const value = feature.properties.training
  return value === 'pollard' || value === 'coppice' ? value : 'free'
}

/** The crown (m) a plant reaches as it is kept: a pollard or a coppice stays narrower than its species left free. */
export function trainedCrown(crownM: number, training: PlantTraining, strata: string | null | undefined): number {
  if (training === 'free' || !strata || !TRAINABLE_STRATA.includes(strata)) return crownM
  return Math.min(crownM, MANAGED_SIZE[training].spread)
}

export const isPlant = (f: MapFeature) => f.properties.layer === 'plants' && f.properties.kind === 'plant'
export const isPatch = (f: MapFeature) => f.properties.layer === 'plants' && f.properties.kind === 'patch'
