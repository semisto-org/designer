import { graftOf, MANAGED_SIZE, managedSize, type Graft, type GraftData, type PlantTraining } from '@/relief/growth'
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

/** Strata whose plants can be pollarded, coppiced or chopped and dropped (trees and bushes). */
export const TRAINABLE_STRATA: readonly string[] = ['canopy', 'sub_canopy', 'shrub']

/** How a plant is kept, from its properties: free when absent or unknown. */
export function trainingProperty(feature: MapFeature): PlantTraining {
  const value = feature.properties.training
  return value === 'pollard' || value === 'coppice' || value === 'chop_and_drop' ? value : 'free'
}

/** Palette roles whose plants are support plants unless their sheet says otherwise (PlantableFeature::SUPPORT_ROLES). */
export const SUPPORT_ROLES: readonly string[] = ['support', 'pioneer']

/**
 * A support plant (nitrogen fixer, pioneer, biomass), which builds the soil
 * and shelters, then gives way to the productive ones: its sheet says so,
 * else its species' role in the palette.
 */
export function isSupportPlant(feature: MapFeature, paletteRole: string | null | undefined): boolean {
  const succession = feature.properties.succession
  if (succession === 'support' || succession === 'productive') return succession === 'support'
  return paletteRole != null && SUPPORT_ROLES.includes(paletteRole)
}

/** Strata whose plants can be grafted fruit trees on a trunk (trees). */
export const GRAFTABLE_STRATA: readonly string[] = ['canopy', 'sub_canopy']

/** What the sheet says of a grafted fruit tree, as the server sends it to the 3D view. */
export function graftProperties(feature: MapFeature): GraftData {
  const p = feature.properties
  const trunk = typeof p.trunk_height === 'number' ? p.trunk_height : typeof p.trunk_height === 'string' ? Number(p.trunk_height) : NaN
  return {
    form: typeof p.graft_form === 'string' ? p.graft_form : null,
    trunkHeight: Number.isFinite(trunk) ? trunk : null,
    vigor: typeof p.rootstock_vigor === 'string' ? p.rootstock_vigor : null,
    rootstock: typeof p.rootstock === 'string' ? p.rootstock : null,
  }
}

/** The grafted tree a plant is, or null when its sheet says nothing of a graft or it is not a tree. */
export function graftProperty(feature: MapFeature, strata: string | null | undefined): Graft | null {
  return strata && GRAFTABLE_STRATA.includes(strata) ? graftOf('tree', graftProperties(feature)) : null
}

/**
 * The crown (m) a plant reaches as it is kept: a pollard or a coppice stays
 * narrower than its species left free, and so does a tree grafted on a weak
 * rootstock.
 */
export function trainedCrown(crownM: number, training: PlantTraining, strata: string | null | undefined, graft: Graft | null = null): number {
  if (!strata || !TRAINABLE_STRATA.includes(strata)) return crownM
  if (training !== 'free') return Math.min(crownM, MANAGED_SIZE[training].spread)
  return graft ? managedSize({ heightM: 0, spreadM: crownM, maturityYears: 1, graft }).spread : crownM
}

export const isPlant = (f: MapFeature) => f.properties.layer === 'plants' && f.properties.kind === 'plant'
export const isPatch = (f: MapFeature) => f.properties.layer === 'plants' && f.properties.kind === 'patch'
